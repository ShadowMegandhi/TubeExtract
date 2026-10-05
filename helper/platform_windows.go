//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

// downloadsDir honours a Downloads folder the user has moved (e.g. to another drive).
func downloadsDir() string {
	if p, err := windows.KnownFolderPath(windows.FOLDERID_Downloads, 0); err == nil && p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Downloads")
}

// prepareChild stops yt-dlp and ffmpeg from flashing console windows.
func prepareChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
}

// killTree also kills the ffmpeg that yt-dlp may have started for merging.
func killTree(pid int) error {
	c := exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid))
	prepareChild(c)
	return c.Run()
}

func revealInFolder(path string) error {
	// explorer needs /select,"path" exactly; Go's own quoting would wrap the whole argument.
	cmd := exec.Command("explorer.exe")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `explorer.exe /select,"` + path + `"`}
	return cmd.Start()
}

// Chrome, Edge and Chromium each read their own key; Brave and other Chrome
// forks on Windows read Google Chrome's.
var registryKeys = []string{
	`Software\Google\Chrome\NativeMessagingHosts\` + hostName,
	`Software\Microsoft\Edge\NativeMessagingHosts\` + hostName,
	`Software\Chromium\NativeMessagingHosts\` + hostName,
}

func manifestPath() string { return filepath.Join(appDir(), hostName+".json") }

func registerHost(manifest []byte) ([]string, error) {
	if err := os.WriteFile(manifestPath(), manifest, 0o644); err != nil {
		return nil, err
	}
	var done []string
	for _, k := range registryKeys {
		key, _, err := registry.CreateKey(registry.CURRENT_USER, k, registry.SET_VALUE)
		if err != nil {
			return done, err
		}
		err = key.SetStringValue("", manifestPath())
		key.Close()
		if err != nil {
			return done, err
		}
		done = append(done, `HKCU\`+k)
	}
	return done, nil
}

func unregisterHost() {
	for _, k := range registryKeys {
		_ = registry.DeleteKey(registry.CURRENT_USER, k)
	}
	_ = os.Remove(manifestPath())
}
