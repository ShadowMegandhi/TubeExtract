// tubeshift-helper is the native-messaging host behind the TubeShift Chrome
// extension. Double-click it to install; Chrome then starts it on demand.
package main

import (
	"fmt"
	"os"
	"slices"
	"strings"
)

// version is set at release time with -ldflags "-X main.version=...".
var version = "0.1.0"

const (
	hostName = "com.tubeshift.helper"
	// Fixed by the "key" in the extension's manifest.json.
	extensionID = "mipkkpejehmafkadcbfiiecngoghaook"
)

func allowedOrigin() string { return "chrome-extension://" + extensionID + "/" }

// chromeOrigin finds the caller origin Chrome passes when it launches a host.
func chromeOrigin(args []string) (string, bool) {
	for _, a := range args {
		if strings.HasPrefix(a, "chrome-extension://") {
			return a, true
		}
	}
	return "", false
}

func main() {
	args := os.Args[1:]
	if origin, ok := chromeOrigin(args); ok {
		if origin != allowedOrigin() {
			fmt.Fprintln(os.Stderr, "tubeshift-helper: refusing caller", origin)
			os.Exit(1)
		}
		os.Exit(runHost())
	}
	interactive := !slices.Contains(args, "--yes")
	command := ""
	if len(args) > 0 && args[0] != "--yes" {
		command = args[0]
	}
	switch command {
	case "", "install":
		os.Exit(install(interactive))
	case "uninstall":
		os.Exit(uninstall(interactive))
	case "version", "--version":
		fmt.Println(version)
	default:
		fmt.Println("usage: tubeshift-helper [install|uninstall|version] [--yes]")
		os.Exit(2)
	}
}
