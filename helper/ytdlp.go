package main

// Everything about talking to yt-dlp that can be tested without running it:
// the whitelist of choices, the argument list, the progress-line parser, and
// which leftover files are safe to delete after a cancel.

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var allowedQualities = map[string]map[string]bool{
	"mp4": {"best": true, "1080": true, "720": true, "480": true, "360": true},
	"mp3": {"320": true, "192": true, "128": true},
}

func validateChoice(format, quality string) error {
	q, ok := allowedQualities[format]
	if !ok {
		return fmt.Errorf("unsupported format %q", format)
	}
	if !q[quality] {
		return fmt.Errorf("unsupported quality %q for %s", quality, format)
	}
	return nil
}

// Spec is one validated download. URL must already be canonical.
type Spec struct {
	URL       string
	Format    string
	Quality   string
	OutDir    string
	FFmpegDir string
	DenoPath  string
}

// Marker prefixes let the parser pick our lines out of yt-dlp's output.
const (
	progressTemplate = "download:TSP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|" +
		"%(progress.total_bytes_estimate)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.format_id)s"
	postprocessTemplate = "postprocess:TSPP|%(progress.postprocessor)s|%(progress.status)s"
	titlePrint          = "before_dl:TST|%(format_id)s|%(title)s"
	filePrint           = "after_move:TSF|%(filepath)s"
	outputTemplate      = "%(title).150B [%(id)s].%(ext)s"
)

func buildArgs(s Spec) []string {
	args := []string{
		// --ignore-config: a user's own yt-dlp.conf must not change where files go.
		"--ignore-config", "--no-playlist", "--no-simulate", "--newline", "--progress", "--no-colors", "--no-mtime",
		"--embed-metadata",
		"-P", s.OutDir, "-o", outputTemplate,
		"--progress-template", progressTemplate,
		"--progress-template", postprocessTemplate,
		"--print", titlePrint,
		"--print", filePrint,
	}
	if s.FFmpegDir != "" {
		args = append(args, "--ffmpeg-location", s.FFmpegDir)
	}
	if s.DenoPath != "" {
		args = append(args, "--js-runtimes", "deno:"+s.DenoPath)
	}
	if s.Format == "mp3" {
		args = append(args, "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", s.Quality+"K",
			"--embed-thumbnail", "--convert-thumbnails", "jpg")
	} else {
		// Prefer H.264 + AAC so the MP4 plays everywhere without re-encoding.
		sort := "res,vcodec:h264,acodec:m4a"
		if s.Quality != "best" {
			sort = "res:" + s.Quality + ",vcodec:h264,acodec:m4a"
		}
		args = append(args, "-f", "bv*+ba/b", "-S", sort, "--merge-output-format", "mp4")
	}
	return append(args, "--", s.URL)
}

// lineEvent is what one line of yt-dlp output means, if anything.
type lineEvent struct {
	progress *progressMsg // ID is filled in by the caller
	path     string
	errLine  string
}

type tracker struct {
	title      string
	formats    []string
	current    int
	downloaded bool // seen any download progress yet
}

var errorPrefix = regexp.MustCompile(`^ERROR:\s*(\[[^\]]+\]\s*[^:\s]+:\s*)?`)

func (t *tracker) handle(line string) (lineEvent, bool) {
	switch {
	case strings.HasPrefix(line, "TST|"):
		fields := strings.SplitN(strings.TrimPrefix(line, "TST|"), "|", 2)
		t.formats = strings.Split(fields[0], "+")
		if len(fields) == 2 {
			t.title = fields[1]
		}
		return lineEvent{progress: &progressMsg{Stage: "starting", Title: t.title}}, true
	case strings.HasPrefix(line, "TSP|"):
		return t.download(strings.Split(strings.TrimPrefix(line, "TSP|"), "|"))
	case strings.HasPrefix(line, "TSPP|"):
		// Thumbnail conversion runs before the download; only report the
		// merge/convert step that follows it.
		if !t.downloaded {
			return lineEvent{}, false
		}
		return lineEvent{progress: &progressMsg{Percent: 100, Stage: "processing"}}, true
	case strings.HasPrefix(line, "TSF|"):
		return lineEvent{path: strings.TrimPrefix(line, "TSF|")}, true
	case strings.HasPrefix(line, "ERROR:"):
		return lineEvent{errLine: strings.TrimSpace(errorPrefix.ReplaceAllString(line, ""))}, true
	}
	return lineEvent{}, false
}

func (t *tracker) download(f []string) (lineEvent, bool) {
	if len(f) < 7 {
		return lineEvent{}, false
	}
	t.downloaded = true
	if i := indexOf(t.formats, f[6]); i >= 0 {
		t.current = i
	}
	frac := 1.0
	if f[0] != "finished" {
		frac = fraction(f[1], f[2], f[3])
	}
	weights := streamWeights(len(t.formats))
	done := 0.0
	for i := 0; i < t.current && i < len(weights); i++ {
		done += weights[i]
	}
	w := 1.0
	if t.current < len(weights) {
		w = weights[t.current]
	}
	pct := math.Round((done+w*frac)*1000) / 10
	return lineEvent{progress: &progressMsg{
		Percent: math.Min(pct, 100), Stage: "downloading", Speed: cleanStat(f[4]), ETA: cleanStat(f[5]),
	}}, true
}

// Video is almost all of a merged download, so it gets most of the bar.
func streamWeights(n int) []float64 {
	switch {
	case n <= 1:
		return []float64{1}
	case n == 2:
		return []float64{0.9, 0.1}
	default:
		w := make([]float64, n)
		for i := range w {
			w[i] = 1 / float64(n)
		}
		return w
	}
}

func fraction(downloaded, total, estimate string) float64 {
	d, err := strconv.ParseFloat(downloaded, 64)
	if err != nil {
		return 0
	}
	for _, s := range []string{total, estimate} {
		if t, err := strconv.ParseFloat(s, 64); err == nil && t > 0 {
			return math.Min(d/t, 1)
		}
	}
	return 0
}

func cleanStat(s string) string {
	s = strings.TrimSpace(s)
	if s == "NA" || strings.Contains(s, "Unknown") {
		return ""
	}
	return s
}

func indexOf(list []string, s string) int {
	for i, v := range list {
		if v == s {
			return i
		}
	}
	return -1
}

var (
	streamFile = regexp.MustCompile(`\.f\d+[\w-]*\.[A-Za-z0-9]+(\.part.*)?$`)
	leftover   = regexp.MustCompile(`(\.part(-Frag\d+)?|\.ytdl|\.webp|\.jpg|\.png)$`)
)

// isPartialFile reports whether name is an in-progress or intermediate file
// from downloading videoID. Finished .mp4/.mp3 files are never matched, so a
// cancel can't delete an earlier successful download of the same video.
func isPartialFile(name, videoID string) bool {
	if !strings.Contains(name, "["+videoID+"]") {
		return false
	}
	return streamFile.MatchString(name) || leftover.MatchString(name) || tempFile.MatchString(name)
}

var tempFile = regexp.MustCompile(`\.temp\.[A-Za-z0-9]+$`)
