package main

// Second, independent check of the link. The extension already reduces it to a
// canonical watch URL (src/core/youtube.ts), but the helper never trusts that:
// only a URL that re-canonicalises to itself is passed to yt-dlp.

import (
	"net/url"
	"regexp"
	"strings"
)

var videoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

var watchHosts = map[string]bool{
	"youtube.com": true, "www.youtube.com": true, "m.youtube.com": true, "music.youtube.com": true,
}

var pathPrefixes = []string{"/shorts/", "/live/", "/embed/"}

func firstSegment(s string) string {
	seg, _, _ := strings.Cut(s, "/")
	return seg
}

func videoIDFrom(u *url.URL) string {
	host := strings.ToLower(u.Hostname())
	if host == "youtu.be" {
		return firstSegment(strings.TrimPrefix(u.Path, "/"))
	}
	if !watchHosts[host] {
		return ""
	}
	if u.Path == "/watch" {
		return u.Query().Get("v")
	}
	for _, p := range pathPrefixes {
		if strings.HasPrefix(u.Path, p) {
			return firstSegment(strings.TrimPrefix(u.Path, p))
		}
	}
	return ""
}

// canonicalYouTubeURL returns the watch URL and video ID for a single-video
// link, or ok=false for anything else.
func canonicalYouTubeURL(raw string) (canonical, id string, ok bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return "", "", false
	}
	id = videoIDFrom(u)
	if !videoIDPattern.MatchString(id) {
		return "", "", false
	}
	return "https://www.youtube.com/watch?v=" + id, id, true
}
