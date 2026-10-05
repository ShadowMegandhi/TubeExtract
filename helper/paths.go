package main

// Where the helper keeps itself and its tools. Nothing here needs admin rights:
// everything lives in the user's own profile.

import (
	"os"
	"path/filepath"
	"runtime"
)

const appName = "ExtractTube"

func appDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		if d := os.Getenv("LOCALAPPDATA"); d != "" {
			return filepath.Join(d, appName)
		}
		return filepath.Join(home, "AppData", "Local", appName)
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", appName)
	default:
		if d := os.Getenv("XDG_DATA_HOME"); d != "" {
			return filepath.Join(d, "extracttube")
		}
		return filepath.Join(home, ".local", "share", "extracttube")
	}
}

func binDir() string { return filepath.Join(appDir(), "bin") }

func exeName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func toolPath(name string) string { return filepath.Join(binDir(), exeName(name)) }

func installedHelperPath() string { return filepath.Join(appDir(), exeName("extracttube-helper")) }

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

// systemFFmpegDirs are checked when the installer didn't download its own
// ffmpeg (e.g. a Mac that already has it from Homebrew). Chrome starts the
// helper with a minimal PATH, so these are absolute.
var systemFFmpegDirs = []string{"/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"}

func ffmpegDir() string {
	if fileExists(toolPath("ffmpeg")) {
		return binDir()
	}
	if runtime.GOOS == "windows" {
		return ""
	}
	for _, d := range systemFFmpegDirs {
		if fileExists(filepath.Join(d, "ffmpeg")) {
			return d
		}
	}
	return ""
}

func denoPath() string {
	if p := toolPath("deno"); fileExists(p) {
		return p
	}
	return ""
}

// isInside reports whether path is dir itself or somewhere beneath it.
func isInside(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	if err != nil {
		return false
	}
	return rel != ".." && !filepath.IsAbs(rel) && (len(rel) < 3 || rel[:3] != ".."+string(filepath.Separator))
}
