package main

// Install mode: what happens when someone double-clicks the helper. It copies
// itself into the app folder, fetches the tools, and tells Chrome where to
// find it. Running it again repairs or upgrades an existing install.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type hostManifestJSON struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

func hostManifest(exe string) []byte {
	b, _ := json.MarshalIndent(hostManifestJSON{
		Name:           hostName,
		Description:    "TubeShift helper: saves YouTube videos with yt-dlp",
		Path:           exe,
		Type:           "stdio",
		AllowedOrigins: []string{allowedOrigin()},
	}, "", "  ")
	return b
}

// installSelf copies the running binary to its permanent home. On Windows a
// running .exe can't be overwritten but can be renamed, so an old copy that
// Chrome still has open is moved aside first.
func installSelf() (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	self, _ = filepath.EvalSymlinks(self)
	target := installedHelperPath()
	if same, _ := filepath.Abs(self); same == target {
		return target, nil
	}
	if fileExists(target) {
		old := target + ".old"
		_ = os.Remove(old)
		if err := os.Rename(target, old); err != nil {
			return "", fmt.Errorf("close Chrome and try again (%w)", err)
		}
	}
	if err := copyFile(self, target); err != nil {
		return "", err
	}
	return target, os.Chmod(target, 0o755)
}

func install(interactive bool) int {
	defer pause(interactive)
	fmt.Printf("TubeShift helper %s setup\n\n", version)
	fmt.Println("Installing to:", appDir())
	if err := os.MkdirAll(binDir(), 0o755); err != nil {
		return fail("couldn't create the folder", err)
	}
	exe, err := installSelf()
	if err != nil {
		return fail("couldn't copy the helper", err)
	}
	tools, err := toolsFor(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return fail("unsupported system", err)
	}
	for _, t := range tools {
		if t.installed() {
			fmt.Printf("  [ok] %s (already installed)\n", t.label)
			continue
		}
		if err := t.fetch(); err != nil {
			return fail("couldn't install "+t.label, err)
		}
		fmt.Printf("  [ok] %s\n", t.label)
	}
	registered, err := registerHost(hostManifest(exe))
	if err != nil {
		return fail("couldn't register with Chrome", err)
	}
	for _, r := range registered {
		fmt.Println("  [ok] registered:", r)
	}
	fmt.Println("\nAll done! Go back to Chrome, open TubeShift and click \"Check again\".")
	fmt.Println("Videos are saved to:", downloadsDir())
	return 0
}

func uninstall(interactive bool) int {
	defer pause(interactive)
	unregisterHost()
	if err := os.RemoveAll(binDir()); err != nil {
		return fail("couldn't remove the tools", err)
	}
	fmt.Println("TubeShift helper removed from Chrome.")
	fmt.Println("You can delete this folder too:", appDir())
	return 0
}

func fail(what string, err error) int {
	fmt.Printf("\nSetup failed: %s: %v\n", what, err)
	return 1
}

// pause keeps a double-clicked console window open long enough to read.
func pause(interactive bool) {
	if !interactive {
		return
	}
	fmt.Print("\nPress Enter to close this window.")
	_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
}
