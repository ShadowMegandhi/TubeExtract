export function ConvertTab() {
  const open = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/converter/converter.html') });
    window.close();
  };
  return (
    <div class="stack">
      <p style={{ margin: 0 }}>
        Turn a video or audio file into <b>MP4, WebM, MOV, MP3, WAV or M4A</b>. It all happens on your computer, and
        nothing is uploaded anywhere.
      </p>
      <p class="muted small" style={{ margin: 0 }}>
        The converter opens in its own tab so it keeps running while you do other things.
      </p>
      <button class="btn btn-primary btn-block" onClick={open}>Open the converter</button>
    </div>
  );
}
