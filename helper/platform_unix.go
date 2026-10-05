//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

func downloadsDir() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "linux" {
		if out, err := exec.Command("xdg-user-dir", "DOWNLOAD").Output(); err == nil {
			if d := strings.TrimSpace(string(out)); d != "" && d != home {
				return d
			}
		}
	}
	return filepath.Join(home, "Downloads")
}

// prepareChild puts yt-dlp in its own process group so killTree can take its
// ffmpeg children down with it.
func prepareChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func killTree(pid int) error { return syscall.Kill(-pid, syscall.SIGKILL) }

func revealInFolder(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", path).Start()
	}
	return exec.Command("xdg-open", filepath.Dir(path)).Start()
}

// Each Chromium-based browser looks in its own profile folder. Chrome always
// gets a manifest; the others only if they appear to be installed.
func hostDirs() []string {
	home, _ := os.UserHomeDir()
	var browsers []string
	if runtime.GOOS == "darwin" {
		base := filepath.Join(home, "Library", "Application Support")
		browsers = []string{"Google/Chrome", "Google/Chrome Beta", "Chromium", "Microsoft Edge",
			"BraveSoftware/Brave-Browser", "Vivaldi"}
		for i, b := range browsers {
			browsers[i] = filepath.Join(base, b)
		}
	} else {
		base := filepath.Join(home, ".config")
		browsers = []string{"google-chrome", "google-chrome-beta", "chromium", "microsoft-edge",
			"BraveSoftware/Brave-Browser", "vivaldi"}
		for i, b := range browsers {
			browsers[i] = filepath.Join(base, b)
		}
	}
	dirs := []string{filepath.Join(browsers[0], "NativeMessagingHosts")}
	for _, b := range browsers[1:] {
		if info, err := os.Stat(b); err == nil && info.IsDir() {
			dirs = append(dirs, filepath.Join(b, "NativeMessagingHosts"))
		}
	}
	return dirs
}

func registerHost(manifest []byte) ([]string, error) {
	var done []string
	for _, d := range hostDirs() {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return done, err
		}
		p := filepath.Join(d, hostName+".json")
		if err := os.WriteFile(p, manifest, 0o644); err != nil {
			return done, err
		}
		done = append(done, p)
	}
	return done, nil
}

func unregisterHost() {
	for _, d := range hostDirs() {
		_ = os.Remove(filepath.Join(d, hostName+".json"))
	}
}
