package main

// Native-messaging host mode: Chrome starts the helper, sends requests on
// stdin, and reads replies on stdout. Nothing else may ever be written to
// stdout, so diagnostics go to stderr (Chrome shows them in its log).

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	progressInterval = 200 * time.Millisecond
	versionTimeout   = 30 * time.Second
	shutdownWait     = 8 * time.Second // longer than the worst-case cleanup retry loop
	updateOutputMax  = 1500

	cleanupAttempts   = 15
	cleanupRetryDelay = 300 * time.Millisecond
)

var jobIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

type job struct {
	id        string
	videoID   string
	outDir    string
	existing  map[string]bool // files in outDir before the download; never deleted
	cmd       *exec.Cmd
	cancelled atomic.Bool
	done      chan struct{}
}

type host struct {
	out *Sender
	mu  sync.Mutex
	job *job
}

func runHost() int {
	h := &host{out: &Sender{w: os.Stdout}}
	for {
		raw, err := readMessage(os.Stdin)
		if err != nil {
			// Chrome closed the port (popup gone, worker restarted, browser quit).
			h.shutdown()
			return 0
		}
		h.handle(raw)
	}
}

func (h *host) send(v any) {
	if err := h.out.Send(v); err != nil {
		fmt.Fprintln(os.Stderr, "tubeshift-helper: send failed:", err)
	}
}

func (h *host) fail(id, format string, args ...any) {
	h.send(errorMsg{Type: "error", ID: id, Message: fmt.Sprintf(format, args...)})
}

func (h *host) handle(raw []byte) {
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		h.fail("", "Bad message from the extension.")
		return
	}
	switch req.Type {
	case "ping":
		// yt-dlp --version can take seconds on a cold start; don't hold up cancel.
		go func() { h.send(pongMsg{Type: "pong", HelperVersion: version, YtdlpVersion: ytdlpVersion()}) }()
	case "download":
		h.startDownload(req)
	case "cancel":
		h.cancel(req.ID)
	case "reveal":
		h.reveal(req.Path)
	case "update":
		go h.update()
	default:
		h.fail("", "Unknown request %q.", req.Type)
	}
}

func ytdlpVersion() string {
	p := toolPath("yt-dlp")
	if !fileExists(p) {
		return "not installed"
	}
	ctx, cancel := context.WithTimeout(context.Background(), versionTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, p, "--version")
	prepareChild(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}

func (h *host) startDownload(req Request) {
	if !jobIDPattern.MatchString(req.ID) {
		h.fail("", "Bad download id.")
		return
	}
	canonical, videoID, ok := canonicalYouTubeURL(req.URL)
	if !ok || canonical != req.URL {
		h.fail(req.ID, "That is not a single YouTube video link.")
		return
	}
	if err := validateChoice(req.Format, req.Quality); err != nil {
		h.fail(req.ID, "%s", err)
		return
	}
	ytdlp := toolPath("yt-dlp")
	if !fileExists(ytdlp) {
		h.fail(req.ID, "yt-dlp is missing. Run the TubeShift helper installer again.")
		return
	}
	outDir := downloadsDir()
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		h.fail(req.ID, "Can't use the Downloads folder: %s", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if h.job != nil {
		h.fail(req.ID, "A download is already running.")
		return
	}
	spec := Spec{URL: canonical, Format: req.Format, Quality: req.Quality, OutDir: outDir,
		FFmpegDir: ffmpegDir(), DenoPath: denoPath()}
	cmd := exec.Command(ytdlp, buildArgs(spec)...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	prepareChild(cmd)
	pr, pw := io.Pipe()
	cmd.Stdout, cmd.Stderr = pw, pw
	existing := listNames(outDir)
	if err := cmd.Start(); err != nil {
		h.fail(req.ID, "Couldn't start yt-dlp: %s", err)
		return
	}
	j := &job{id: req.ID, videoID: videoID, outDir: outDir, existing: existing, cmd: cmd, done: make(chan struct{})}
	h.job = j
	go h.follow(j, pr)
	go func() {
		err := cmd.Wait()
		pw.CloseWithError(err)
	}()
}

// follow reads yt-dlp's output until it exits, then reports how it ended.
func (h *host) follow(j *job, output io.Reader) {
	defer close(j.done)
	tr := &tracker{}
	var path, lastErr, lastStage string
	var lastSent time.Time
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		ev, ok := tr.handle(strings.TrimRight(scanner.Text(), "\r"))
		switch {
		case !ok:
		case ev.path != "":
			path = ev.path
		case ev.errLine != "":
			lastErr = ev.errLine
		case ev.progress != nil:
			p := *ev.progress
			if p.Stage == lastStage && p.Title == "" && time.Since(lastSent) < progressInterval {
				continue
			}
			p.Type, p.ID = "progress", j.id
			h.send(p)
			lastStage, lastSent = p.Stage, time.Now()
		}
	}
	if scanner.Err() != nil {
		// A line too long for the scanner: keep draining so yt-dlp never blocks on a full pipe.
		_, _ = io.Copy(io.Discard, output)
	}
	exitErr := j.cmd.ProcessState == nil || !j.cmd.ProcessState.Success()

	h.mu.Lock()
	h.job = nil
	h.mu.Unlock()

	switch {
	case j.cancelled.Load():
		cleanupPartials(j)
		h.send(cancelledMsg{Type: "cancelled", ID: j.id})
	case !exitErr && path != "":
		h.send(doneMsg{Type: "done", ID: j.id, Path: path})
	default:
		cleanupPartials(j)
		if lastErr == "" {
			lastErr = "yt-dlp stopped without saving a file."
		}
		h.fail(j.id, "%s", lastErr)
	}
}

// cleanupPartials retries because on Windows the killed yt-dlp (a launcher
// plus a child process) can hold the .part file open for a moment after the
// output pipe closes, and an open file can't be deleted.
func cleanupPartials(j *job) {
	for attempt := 0; attempt < cleanupAttempts; attempt++ {
		if removePartials(j) == 0 {
			return
		}
		time.Sleep(cleanupRetryDelay)
	}
}

func listNames(dir string) map[string]bool {
	names := map[string]bool{}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		names[e.Name()] = true
	}
	return names
}

// removePartials deletes what it can and returns how many partial files remain.
// Only files that appeared during this download are candidates, so nothing the
// user already had can be touched.
func removePartials(j *job) int {
	entries, err := os.ReadDir(j.outDir)
	if err != nil {
		return 0
	}
	left := 0
	for _, e := range entries {
		if e.IsDir() || j.existing[e.Name()] || !isPartialFile(e.Name(), j.videoID) {
			continue
		}
		if err := os.Remove(filepath.Join(j.outDir, e.Name())); err != nil && !os.IsNotExist(err) {
			left++
		}
	}
	return left
}

func (h *host) cancel(id string) {
	h.mu.Lock()
	j := h.job
	h.mu.Unlock()
	if j == nil || j.id != id {
		return
	}
	j.cancelled.Store(true)
	if err := killTree(j.cmd.Process.Pid); err != nil {
		_ = j.cmd.Process.Kill()
	}
}

func (h *host) shutdown() {
	h.mu.Lock()
	j := h.job
	h.mu.Unlock()
	if j == nil {
		return
	}
	h.cancel(j.id)
	select {
	case <-j.done:
	case <-time.After(shutdownWait):
	}
}

func (h *host) reveal(path string) {
	clean := filepath.Clean(path)
	if !filepath.IsAbs(clean) || !isInside(clean, downloadsDir()) || !fileExists(clean) {
		h.fail("", "Can't show that file.")
		return
	}
	if err := revealInFolder(clean); err != nil {
		h.fail("", "Couldn't open the folder: %s", err)
	}
}

func (h *host) update() {
	h.mu.Lock()
	busy := h.job != nil
	h.mu.Unlock()
	if busy {
		h.send(updatedMsg{Type: "updated", OK: false, Output: "Wait for the current download to finish first."})
		return
	}
	cmd := exec.Command(toolPath("yt-dlp"), "-U")
	prepareChild(cmd)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if len(text) > updateOutputMax {
		text = text[len(text)-updateOutputMax:]
	}
	h.send(updatedMsg{Type: "updated", OK: err == nil, Output: text})
}
