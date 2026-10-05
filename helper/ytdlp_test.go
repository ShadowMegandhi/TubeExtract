package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func TestCanonicalYouTubeURL(t *testing.T) {
	const id = "dQw4w9WgXcQ"
	want := "https://www.youtube.com/watch?v=" + id
	good := []string{
		"https://www.youtube.com/watch?v=" + id,
		"https://youtube.com/watch?v=" + id + "&t=4s",
		"https://m.youtube.com/watch?v=" + id,
		"https://music.youtube.com/watch?v=" + id,
		"https://youtu.be/" + id + "?si=x",
		"https://www.youtube.com/shorts/" + id,
		"https://www.youtube.com/live/" + id,
		"https://www.youtube.com/embed/" + id,
	}
	for _, in := range good {
		got, gotID, ok := canonicalYouTubeURL(in)
		if !ok || got != want || gotID != id {
			t.Errorf("canonicalYouTubeURL(%q) = %q, %q, %v", in, got, gotID, ok)
		}
	}
	bad := []string{
		"", "youtu.be/" + id, "ftp://youtu.be/" + id, "https://vimeo.com/" + id,
		"https://www.youtube.com.evil.com/watch?v=" + id, "https://www.youtube.com/watch?v=short",
		"https://www.youtube.com/playlist?list=PL1", "https://www.youtube.com/watch?v=--exec=calc",
	}
	for _, in := range bad {
		if _, _, ok := canonicalYouTubeURL(in); ok {
			t.Errorf("canonicalYouTubeURL(%q) accepted a bad link", in)
		}
	}
}

func TestValidateChoice(t *testing.T) {
	for _, c := range [][2]string{{"mp4", "best"}, {"mp4", "720"}, {"mp3", "320"}, {"mp3", "128"}} {
		if err := validateChoice(c[0], c[1]); err != nil {
			t.Errorf("validateChoice(%v) = %v", c, err)
		}
	}
	for _, c := range [][2]string{{"mp4", "320"}, {"mp3", "best"}, {"mkv", "720"}, {"mp4", "720 --exec x"}} {
		if err := validateChoice(c[0], c[1]); err == nil {
			t.Errorf("validateChoice(%v) accepted a bad choice", c)
		}
	}
}

func TestBuildArgsMP4(t *testing.T) {
	args := buildArgs(Spec{URL: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", Format: "mp4", Quality: "720",
		OutDir: "/dl", FFmpegDir: "/bin", DenoPath: "/bin/deno"})
	mustContainPair(t, args, "-S", "res:720,vcodec:h264,acodec:m4a")
	mustContainPair(t, args, "--merge-output-format", "mp4")
	mustContainPair(t, args, "-P", "/dl")
	mustContainPair(t, args, "--ffmpeg-location", "/bin")
	mustContainPair(t, args, "--js-runtimes", "deno:/bin/deno")
	if !slices.Contains(args, "--ignore-config") || !slices.Contains(args, "--no-playlist") {
		t.Error("missing safety flags")
	}
	if args[len(args)-2] != "--" || args[len(args)-1] != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" {
		t.Errorf("URL must come last, after --: %v", args[len(args)-2:])
	}
}

func TestBuildArgsBestAndMP3(t *testing.T) {
	best := buildArgs(Spec{URL: "u", Format: "mp4", Quality: "best", OutDir: "/dl"})
	mustContainPair(t, best, "-S", "res,vcodec:h264,acodec:m4a")
	if slices.Contains(best, "--ffmpeg-location") || slices.Contains(best, "--js-runtimes") {
		t.Error("optional tool flags should be absent when the tools are")
	}
	mp3 := buildArgs(Spec{URL: "u", Format: "mp3", Quality: "192", OutDir: "/dl"})
	mustContainPair(t, mp3, "--audio-format", "mp3")
	mustContainPair(t, mp3, "--audio-quality", "192K")
	if !slices.Contains(mp3, "-x") {
		t.Error("mp3 must extract audio")
	}
}

func mustContainPair(t *testing.T, args []string, flag, value string) {
	t.Helper()
	i := slices.Index(args, flag)
	if i < 0 || i+1 >= len(args) || args[i+1] != value {
		t.Errorf("want %s %s in %v", flag, value, args)
	}
}

// Lines captured from a real yt-dlp 2026.08.19 run with buildArgs' templates.
var realRun = []string{
	"TST|133+140|Me at the zoo",
	"TSP|downloading|1024|433081|NA| Unknown B/s|Unknown|133",
	"TSP|downloading|216540|433081|NA|   1.46MiB/s|00:00|133",
	"TSP|finished|433081|433081|NA|5.00MiB/s|NA|133",
	"TSP|downloading|154644|309288|NA|  2.00MiB/s|00:01|140",
	"TSP|finished|309288|309288|NA|3.79MiB/s|NA|140",
	"TSPP|Merger|started",
	"TSF|C:\\Users\\x\\Downloads\\Me at the zoo [jNQXAC9IVRw].mp4",
}

func TestTrackerFollowsARealRun(t *testing.T) {
	tr := &tracker{}
	var events []lineEvent
	for _, l := range realRun {
		if ev, ok := tr.handle(l); ok {
			events = append(events, ev)
		}
	}
	if tr.title != "Me at the zoo" {
		t.Errorf("title = %q", tr.title)
	}
	pct := func(i int) float64 { return events[i].progress.Percent }
	// Stream 1 of 2 (video) is weighted 90%, stream 2 (audio) 10%.
	if p := pct(2); p < 44 || p > 46 {
		t.Errorf("half-way through video should be ~45%%, got %v", p)
	}
	if p := pct(4); p < 94 || p > 96 {
		t.Errorf("half-way through audio should be ~95%%, got %v", p)
	}
	if events[2].progress.Speed != "1.46MiB/s" || events[2].progress.ETA != "00:00" {
		t.Errorf("speed/eta not trimmed: %+v", events[2].progress)
	}
	if events[1].progress.Speed != "" || events[1].progress.ETA != "" {
		t.Errorf("Unknown speed/eta should be blank: %+v", events[1].progress)
	}
	post := events[len(events)-2]
	if post.progress == nil || post.progress.Stage != "processing" {
		t.Errorf("postprocess should report processing, got %+v", post)
	}
	last := events[len(events)-1]
	if last.path != "C:\\Users\\x\\Downloads\\Me at the zoo [jNQXAC9IVRw].mp4" {
		t.Errorf("final path = %q", last.path)
	}
}

func TestTrackerSingleStreamAndEstimates(t *testing.T) {
	tr := &tracker{}
	tr.handle("TST|251|Song | with pipes")
	if tr.title != "Song | with pipes" {
		t.Errorf("titles may contain pipes, got %q", tr.title)
	}
	ev, _ := tr.handle("TSP|downloading|50|NA|200|1MiB/s|00:03|251")
	if ev.progress.Percent != 25 {
		t.Errorf("should fall back to the size estimate, got %v", ev.progress.Percent)
	}
	if _, ok := (&tracker{}).handle("TSPP|ThumbnailsConvertor|started"); ok {
		t.Error("postprocessing before any download is a pre-step and should not be reported")
	}
	if _, ok := tr.handle("[download] something else"); ok {
		t.Error("unrelated lines should be ignored")
	}
	if ev, ok := tr.handle("ERROR: [youtube] abc: Video unavailable"); !ok || ev.errLine != "Video unavailable" {
		t.Errorf("error line not captured: %+v", ev)
	}
}

func TestIsPartialFile(t *testing.T) {
	id := "jNQXAC9IVRw"
	partial := []string{
		"Me at the zoo [jNQXAC9IVRw].f133.mp4", "Me at the zoo [jNQXAC9IVRw].f140.m4a.part",
		"Me at the zoo [jNQXAC9IVRw].mp4.part", "Me at the zoo [jNQXAC9IVRw].mp4.ytdl",
		"Me at the zoo [jNQXAC9IVRw].temp.mp4", "Me at the zoo [jNQXAC9IVRw].f133.mp4.part-Frag3",
		"Me at the zoo [jNQXAC9IVRw].webp",
	}
	for _, n := range partial {
		if !isPartialFile(n, id) {
			t.Errorf("%q should be cleaned up", n)
		}
	}
	keep := []string{
		"Me at the zoo [jNQXAC9IVRw].mp4", "Me at the zoo [jNQXAC9IVRw].mp3",
		"Other [dQw4w9WgXcQ].f133.mp4", "holiday.mp4.part",
		"My.temp.mix [jNQXAC9IVRw].mp4",
	}
	for _, n := range keep {
		if isPartialFile(n, id) {
			t.Errorf("%q must not be deleted", n)
		}
	}
}

func TestMessageFraming(t *testing.T) {
	var buf bytes.Buffer
	s := &Sender{w: &buf}
	if err := s.Send(doneMsg{Type: "done", ID: "a", Path: "p"}); err != nil {
		t.Fatal(err)
	}
	n := binary.NativeEndian.Uint32(buf.Bytes()[:4])
	if int(n) != buf.Len()-4 {
		t.Fatalf("header says %d bytes, body is %d", n, buf.Len()-4)
	}
	body, err := readMessage(&buf)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]string
	if err := json.Unmarshal(body, &got); err != nil || got["path"] != "p" {
		t.Errorf("round trip failed: %s %v", body, err)
	}
}

func TestReadMessageRejectsHugeLengths(t *testing.T) {
	var header [4]byte
	binary.NativeEndian.PutUint32(header[:], maxMessageBytes+1)
	if _, err := readMessage(bytes.NewReader(header[:])); err == nil || !strings.Contains(err.Error(), "too large") {
		t.Errorf("want too-large error, got %v", err)
	}
}
