import { useEffect, useRef, useState } from 'preact/hooks';
import {
  CONVERT_FORMATS, defaultQuality, isAudioFormat, outputName, qualitiesFor, type ConvertFormat,
} from '@core/formats';
import { ConversionError, createEngine, type Stage } from './engine';

const LARGE_FILE_BYTES = 1.5 * 1024 ** 3;
const ACCEPT = 'video/*,audio/*,.mkv,.mov,.avi,.flv,.wmv,.m4v,.3gp,.flac,.ogg,.opus,.aac,.wma,.aiff';
const FORMAT_HINT: Record<ConvertFormat, string> = {
  mp4: 'video', webm: 'video', mov: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio',
};
const STAGE_TEXT: Record<Stage, string> = {
  loading: 'Starting the converter…',
  converting: 'Converting',
  reencoding: 'Re-encoding (a quick copy wasn’t possible)',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; stage: Stage; progress: number }
  | { kind: 'done'; name: string; size: number; downloadId: number | null }
  | { kind: 'error'; message: string; log: string };

const engine = createEngine();

function formatBytes(n: number): string {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180);
}

async function save(blob: Blob, name: string): Promise<number | null> {
  const url = URL.createObjectURL(blob);
  try {
    return await chrome.downloads.download({ url, filename: safeFileName(name), saveAs: false });
  } catch {
    // Fall back to a plain link click if the downloads API refuses.
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    return null;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ConvertFormat>('mp3');
  const [quality, setQuality] = useState(defaultQuality('mp3'));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // terminate() rejects the running conversion; this tells handleConvert it was on purpose.
  const isCancelledRef = useRef(false);

  const isWorking = status.kind === 'working';
  const isAudioInput = file?.type.startsWith('audio/') ?? false;

  useEffect(() => {
    if (!isWorking) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isWorking]);

  const pickFormat = (next: ConvertFormat) => {
    setFormat(next);
    setQuality(defaultQuality(next));
  };

  const pickFile = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setStatus({ kind: 'idle' });
    if (next.type.startsWith('audio/') && !isAudioFormat(format)) pickFormat('mp3');
  };

  const handleConvert = async () => {
    if (!file) return;
    isCancelledRef.current = false;
    setStatus({ kind: 'working', stage: 'loading', progress: 0 });
    try {
      const blob = await engine.convert(file, format, quality, {
        onStage: (stage) => setStatus({ kind: 'working', stage, progress: 0 }),
        onProgress: (progress) => setStatus((s) => (s.kind === 'working' ? { ...s, progress } : s)),
      });
      const name = outputName(file.name, format);
      const downloadId = await save(blob, name);
      setStatus({ kind: 'done', name, size: blob.size, downloadId });
    } catch (e: unknown) {
      if (isCancelledRef.current) return;
      if (e instanceof ConversionError) setStatus({ kind: 'error', message: e.message, log: e.log });
      else setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e), log: '' });
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    engine.cancel();
    setStatus({ kind: 'idle' });
  };

  const reset = () => {
    setFile(null);
    setStatus({ kind: 'idle' });
  };

  return (
    <div class="page">
      <div class="brand">
        <img src="/icons/icon-128.png" alt="" />
        <h1>TubeExtract Converter</h1>
      </div>
      <p class="lead muted">Convert video and audio files on your own computer. Nothing is uploaded.</p>

      <div class="stack" style={{ gap: '20px' }}>
        {file ? (
          <div class="card file">
            <div class="file-name">
              <div class="truncate" title={file.name}>{file.name}</div>
              <div class="small muted">{formatBytes(file.size)}</div>
            </div>
            {!isWorking && <button class="btn" onClick={() => inputRef.current?.click()}>Change</button>}
          </div>
        ) : (
          <label
            class={isOver ? 'drop is-over' : 'drop'}
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsOver(false); pickFile(e.dataTransfer?.files[0]); }}
          >
            <span class="drop-icon" aria-hidden="true">⬆</span>
            <b>Drop a video or audio file here</b>
            <span class="small muted">or click to choose one</span>
            <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e) => pickFile((e.target as HTMLInputElement).files?.[0])} />
          </label>
        )}
        {file && (
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => pickFile((e.target as HTMLInputElement).files?.[0])} />
        )}

        {file && file.size > LARGE_FILE_BYTES && (
          <div class="card card-warn small">
            This is a big file. Browser converters run out of memory around 2 GB, so this might fail. Shorter clips or
            an audio-only format (MP3/M4A) work best.
          </div>
        )}

        <div class="field">
          <span class="label">Convert to</span>
          <div class="formats" role="group" aria-label="Output format">
            {CONVERT_FORMATS.map((f) => {
              const isDisabled = isWorking || (isAudioInput && !isAudioFormat(f));
              return (
                <button key={f} type="button" aria-pressed={format === f} disabled={isDisabled} onClick={() => pickFormat(f)}>
                  {f.toUpperCase()}
                  <small>{FORMAT_HINT[f]}</small>
                </button>
              );
            })}
          </div>
        </div>

        {qualitiesFor(format).length > 0 && (
          <div class="field">
            <label class="label" for="quality">Quality</label>
            <select id="quality" class="select" value={quality} disabled={isWorking}
              onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}>
              {qualitiesFor(format).map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </div>
        )}

        <StatusPanel status={status} onConvert={() => void handleConvert()} onCancel={handleCancel} onReset={reset} hasFile={file !== null} />
      </div>

      <p class="foot small muted">Video conversion is slower than audio because it runs inside the browser. Keep this tab open until it finishes.</p>
    </div>
  );
}

type PanelProps = {
  status: Status;
  hasFile: boolean;
  onConvert: () => void;
  onCancel: () => void;
  onReset: () => void;
};

function StatusPanel({ status, hasFile, onConvert, onCancel, onReset }: PanelProps) {
  if (status.kind === 'working') {
    const isIndeterminate = status.stage === 'loading' || status.progress === 0;
    const pct = Math.round(status.progress * 100);
    return (
      <div class="stack" style={{ gap: '8px' }}>
        <div class={isIndeterminate ? 'progress progress-indeterminate' : 'progress'}><div style={{ width: `${pct}%` }} /></div>
        <div class="row small muted" style={{ justifyContent: 'space-between' }}>
          <span>{STAGE_TEXT[status.stage]}{status.stage !== 'loading' && pct > 0 ? ` ${pct}%` : '…'}</span>
          <button class="btn-link" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  if (status.kind === 'done') {
    return (
      <div class="card stack" style={{ gap: '10px' }}>
        <div><span class="ok-text">Done! Saved to your Downloads:</span> <b>{status.name}</b> <span class="muted small">({formatBytes(status.size)})</span></div>
        <div class="row">
          {status.downloadId !== null && (
            <button class="btn" onClick={() => chrome.downloads.show(status.downloadId!)}>Show in folder</button>
          )}
          <button class="btn btn-primary" onClick={onReset}>Convert another file</button>
        </div>
      </div>
    );
  }
  return (
    <div class="stack" style={{ gap: '8px' }}>
      {status.kind === 'error' && (
        <div class="card small">
          <div class="error-text">{status.message} Try a different format, or check the file plays normally.</div>
          {status.log && <pre class="log muted">{status.log}</pre>}
        </div>
      )}
      <button class="btn btn-primary btn-block" disabled={!hasFile} onClick={onConvert}>Convert</button>
    </div>
  );
}
