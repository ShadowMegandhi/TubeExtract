package main

// Chrome native messaging: every message is a 4-byte length in native byte
// order followed by that many bytes of UTF-8 JSON. Chrome caps messages to
// the host at 64 MiB and from the host at 1 MiB; ours are tiny.
//
// The message shapes mirror src/core/messages.ts. Change both together.

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

const maxMessageBytes = 1 << 20

// Request is any message from the extension. Fields a type doesn't use are empty.
type Request struct {
	Type    string `json:"type"`
	ID      string `json:"id,omitempty"`
	URL     string `json:"url,omitempty"`
	Format  string `json:"format,omitempty"`
	Quality string `json:"quality,omitempty"`
	Path    string `json:"path,omitempty"`
}

type pongMsg struct {
	Type          string `json:"type"`
	HelperVersion string `json:"helperVersion"`
	YtdlpVersion  string `json:"ytdlpVersion"`
}

type progressMsg struct {
	Type    string  `json:"type"`
	ID      string  `json:"id"`
	Percent float64 `json:"percent"`
	Stage   string  `json:"stage"`
	Speed   string  `json:"speed,omitempty"`
	ETA     string  `json:"eta,omitempty"`
	Title   string  `json:"title,omitempty"`
}

type doneMsg struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Path string `json:"path"`
}

type cancelledMsg struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type errorMsg struct {
	Type    string `json:"type"`
	ID      string `json:"id,omitempty"`
	Message string `json:"message"`
}

type updatedMsg struct {
	Type   string `json:"type"`
	OK     bool   `json:"ok"`
	Output string `json:"output"`
}

func readMessage(r io.Reader) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return nil, err
	}
	n := binary.NativeEndian.Uint32(header[:])
	if n > maxMessageBytes {
		return nil, fmt.Errorf("message too large: %d bytes", n)
	}
	body := make([]byte, n)
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}
	return body, nil
}

// Sender serialises writes, since the download goroutine and the main loop
// both talk to Chrome over the same stdout.
type Sender struct {
	mu sync.Mutex
	w  io.Writer
}

func (s *Sender) Send(v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if len(body) > maxMessageBytes {
		return fmt.Errorf("reply too large: %d bytes", len(body))
	}
	var header [4]byte
	binary.NativeEndian.PutUint32(header[:], uint32(len(body)))
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.w.Write(header[:]); err != nil {
		return err
	}
	_, err = s.w.Write(body)
	return err
}
