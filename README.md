# TubeExtract

A Chrome extension that:

- **Saves YouTube links as MP4 (video) or MP3 (audio)** with a quality picker (360p–best, 128–320 kbps).
- **Converts your own files** (MP4, WebM, MOV, MP3, WAV, M4A), entirely inside your browser. Nothing gets uploaded.

Works in Chrome, Edge, Brave and other Chromium browsers on Windows, macOS and Linux.

> TubeExtract isn't affiliated with YouTube or Google. Only download videos you own or have permission to save, and follow YouTube's Terms of Service and your local copyright law.

## Install

Download everything from the **[latest release](https://github.com/ShadowMegandhi/TubeExtract/releases/latest)**.

### 1. The extension

1. Download `tubeextract-extension-vX.Y.Z.zip` and unzip it somewhere you'll keep it, for example `Documents/TubeExtract`.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Pin TubeExtract from the puzzle-piece menu so it's easy to reach.

TubeExtract isn't on the Chrome Web Store, because the Store doesn't allow YouTube downloaders. That's why the extension is loaded this way.

### 2. The helper (only needed for YouTube)

Chrome can't save YouTube videos by itself, so TubeExtract uses a small helper app on your computer. It runs the open-source [yt-dlp](https://github.com/yt-dlp/yt-dlp). The first time you open the helper, it downloads yt-dlp, [ffmpeg](https://ffmpeg.org) and [Deno](https://deno.com) from their official releases into its own folder and tells Chrome where it is. It doesn't need admin rights.

**Windows:** download `tubeextract-helper-windows-x64.exe` and double-click it. If SmartScreen says "Windows protected your PC", click **More info → Run anyway**. When it prints "All done", press Enter.

**macOS:** download `tubeextract-helper-macos-apple-silicon` (M-series Macs) or `tubeextract-helper-macos-intel`. macOS blocks downloaded command-line apps, so open **Terminal** and run (adjust the name to match your file):

```sh
cd ~/Downloads
xattr -d com.apple.quarantine tubeextract-helper-macos-apple-silicon
chmod +x tubeextract-helper-macos-apple-silicon
./tubeextract-helper-macos-apple-silicon
```

**Linux:** download `tubeextract-helper-linux-x64` (or `-arm64`), then `chmod +x` it and run it.

Then open TubeExtract in Chrome and click **Check again**. You can delete the helper file you downloaded afterwards, because it copied itself into place.

## Using it

- **YouTube:** open a video and click the TubeExtract icon. The link is filled in for you. Choose **MP4 video** or **MP3 audio** and a quality, then click **Download**. Files go to your normal Downloads folder. You can close the popup; the download keeps going, and the progress is still there when you reopen it.
- **Your own files:** click **Convert a file → Open the converter**, drop in a file, choose a format and click **Convert**. Audio conversions are quick. Video takes longer because it runs inside the browser, so keep the tab open. Files over about 1.5 GB may run out of browser memory.

## Updating

TubeExtract checks GitHub for new versions on its own (every few hours, nothing is sent about you). When one exists, a yellow notice appears at the top of the popup:

1. Click **Download** in the notice. You get the new `tubeextract-extension-vX.Y.Z.zip`.
2. Unzip it **over** your existing TubeExtract folder, replacing the old files.
3. Open `chrome://extensions` and click the small ↻ (reload) on the TubeExtract card.

If a release also changes the helper, the notice says so; run the new helper file once, same as the first time.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Chrome says "Disable developer mode extensions" when it starts | Expected for any extension that isn't from the Web Store. Close the message; TubeExtract keeps working. |
| "One-time setup needed" stays after installing the helper | Fully quit and reopen Chrome, then click **Check again**. |
| A YouTube download fails | YouTube changes often. Click **Update yt-dlp** at the bottom of the popup and try again. |
| "Sign in to confirm you're not a bot" | YouTube is rate-limiting your connection. Wait a while, or update yt-dlp. |
| Wrong browser profile / Edge or Brave not detected | Run the helper again after installing the browser. |

To remove the helper, run it with `uninstall` (for example `tubeextract-helper-windows-x64.exe uninstall`), then delete the folder it prints.

## How it works

```
popup ──► service worker ──native messaging──► tubeextract-helper ──► yt-dlp + ffmpeg ──► Downloads
converter tab ──► ffmpeg.wasm (in the browser) ──► chrome.downloads
```

- `src/`: the MV3 extension (TypeScript, Preact, Vite). `src/core` holds the pure logic and its unit tests.
- `helper/`: the native-messaging host (Go, a single static binary). It only accepts connections from this extension's ID. It re-checks every link itself, passes yt-dlp a fixed argument list (no shell), and only ever writes to your Downloads folder.

## Development

```sh
npm install
npm test            # unit tests (Vitest)
npm run build       # builds dist/ — load it unpacked
npm run e2e         # Playwright end-to-end tests (needs ffmpeg on PATH)

cd helper
go test ./...
go build -o bin/tubeextract-helper .   # then run it once to register
```

Releasing is automatic. Bump the version and push:

```sh
npm run bump        # 0.3.1 -> 0.3.2  (or: npm run bump minor / major / 1.2.3)
git commit -am "release: v0.3.2"
git push
```

GitHub Actions (`.github/workflows/release.yml`) sees a version on `main` with no release yet, runs the tests, builds the extension zip and all five helper binaries, and publishes the release with checksums. Pushes that don't change the version just run CI.

## Licence

MIT. See [LICENSE](LICENSE). yt-dlp, ffmpeg and Deno are separate projects under their own licences. The helper downloads them from their official sources and doesn't redistribute them.
