package main

// The three programs the helper drives, fetched at install time from their
// official release pages rather than bundled. That keeps yt-dlp current
// (YouTube breaks old versions within weeks) and keeps GPL ffmpeg builds out
// of this repo's own releases.

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type tool struct {
	label   string
	url     string
	archive string   // "", "zip" or "tar.xz"
	members []string // file names to keep from the archive (or the single saved name)
}

const (
	ytdlpBase  = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/"
	ffmpegBase = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/"
	denoBase   = "https://github.com/denoland/deno/releases/latest/download/"
)

func toolsFor(goos, goarch string) ([]tool, error) {
	switch goos + "/" + goarch {
	case "windows/amd64":
		return []tool{
			{"yt-dlp", ytdlpBase + "yt-dlp.exe", "", []string{"yt-dlp.exe"}},
			{"ffmpeg", ffmpegBase + "ffmpeg-master-latest-win64-gpl.zip", "zip", []string{"ffmpeg.exe", "ffprobe.exe"}},
			{"deno", denoBase + "deno-x86_64-pc-windows-msvc.zip", "zip", []string{"deno.exe"}},
		}, nil
	case "darwin/arm64", "darwin/amd64":
		arch := map[string]string{"arm64": "aarch64", "amd64": "x86_64"}[goarch]
		list := []tool{
			{"yt-dlp", ytdlpBase + "yt-dlp_macos", "", []string{"yt-dlp"}},
			{"deno", denoBase + "deno-" + arch + "-apple-darwin.zip", "zip", []string{"deno"}},
		}
		if ffmpegDir() == "" {
			list = append(list,
				tool{"ffmpeg", "https://evermeet.cx/ffmpeg/getrelease/zip", "zip", []string{"ffmpeg"}},
				tool{"ffprobe", "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip", "zip", []string{"ffprobe"}})
		}
		return list, nil
	case "linux/amd64":
		return []tool{
			{"yt-dlp", ytdlpBase + "yt-dlp_linux", "", []string{"yt-dlp"}},
			{"ffmpeg", ffmpegBase + "ffmpeg-master-latest-linux64-gpl.tar.xz", "tar.xz", []string{"ffmpeg", "ffprobe"}},
			{"deno", denoBase + "deno-x86_64-unknown-linux-gnu.zip", "zip", []string{"deno"}},
		}, nil
	case "linux/arm64":
		return []tool{
			{"yt-dlp", ytdlpBase + "yt-dlp_linux_aarch64", "", []string{"yt-dlp"}},
			{"ffmpeg", ffmpegBase + "ffmpeg-master-latest-linuxarm64-gpl.tar.xz", "tar.xz", []string{"ffmpeg", "ffprobe"}},
			{"deno", denoBase + "deno-aarch64-unknown-linux-gnu.zip", "zip", []string{"deno"}},
		}, nil
	}
	return nil, fmt.Errorf("%s/%s isn't supported yet", goos, goarch)
}

func (t tool) installed() bool {
	for _, m := range t.members {
		if !fileExists(filepath.Join(binDir(), m)) {
			return false
		}
	}
	return true
}

func (t tool) fetch() error {
	tmp, err := os.CreateTemp(binDir(), "download-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := download(t.url, tmp, t.label); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()
	switch t.archive {
	case "zip":
		return extractZip(tmp.Name(), t.members)
	case "tar.xz":
		return extractTarXz(tmp.Name(), t.members)
	default:
		return placeFile(tmp.Name(), t.members[0])
	}
}

func download(url string, dst io.Writer, label string) error {
	client := &http.Client{Timeout: 30 * time.Minute}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "extracttube-helper/"+version)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: %s (%s)", resp.Status, url)
	}
	_, err = io.Copy(dst, &progressReader{r: resp.Body, total: resp.ContentLength, label: label})
	fmt.Println()
	return err
}

type progressReader struct {
	r       io.Reader
	total   int64
	read    int64
	label   string
	lastPct int64
}

func (p *progressReader) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	p.read += int64(n)
	if p.total > 0 {
		if pct := p.read * 100 / p.total; pct != p.lastPct {
			p.lastPct = pct
			fmt.Printf("\r  Downloading %s... %3d%%", p.label, pct)
		}
	} else {
		fmt.Printf("\r  Downloading %s... %d MB", p.label, p.read>>20)
	}
	return n, err
}

func placeFile(src, name string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	return writeAtomically(filepath.Join(binDir(), name), in)
}

// writeAtomically writes to a temp name and renames, so an interrupted install
// never leaves a truncated tool that installed() would mistake for complete.
func writeAtomically(dst string, r io.Reader) error {
	tmp := dst + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, r)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

func extractZip(path string, members []string) error {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer zr.Close()
	found := 0
	for _, f := range zr.File {
		name := filepath.Base(f.Name)
		if f.FileInfo().IsDir() || indexOf(members, name) < 0 {
			continue
		}
		if err := writeZipEntry(f, filepath.Join(binDir(), name)); err != nil {
			return err
		}
		found++
	}
	if found < len(members) {
		return fmt.Errorf("the download didn't contain %v", members)
	}
	return nil
}

func writeZipEntry(f *zip.File, dst string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	return writeAtomically(dst, rc)
}

// extractTarXz shells out to tar, which every Linux has and which handles xz.
func extractTarXz(path string, members []string) error {
	dir, err := os.MkdirTemp(binDir(), "extract-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if out, err := exec.Command("tar", "-xJf", path, "-C", dir).CombinedOutput(); err != nil {
		return fmt.Errorf("tar: %v: %s", err, out)
	}
	found := 0
	err = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || indexOf(members, d.Name()) < 0 {
			return err
		}
		found++
		return placeFile(p, d.Name())
	})
	if err == nil && found < len(members) {
		err = fmt.Errorf("the download didn't contain %v", members)
	}
	return err
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
