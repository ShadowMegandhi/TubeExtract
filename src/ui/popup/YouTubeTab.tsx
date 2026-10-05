import { useEffect, useState } from 'preact/hooks';
import { DOWNLOAD_QUALITIES, type DownloadFormat } from '@core/messages';
import { parseYouTubeUrl } from '@core/youtube';
import type { SessionState } from '../../background/state';
import { command } from '../shared/useSession';
import { JobCard } from './JobCard';
import { SetupCard } from './SetupCard';

type Props = { session: SessionState };

const DEFAULT_QUALITY: Record<DownloadFormat, string> = { mp4: '1080', mp3: '192' };

export function YouTubeTab({ session }: Props) {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<DownloadFormat>('mp4');
  const [quality, setQuality] = useState(DEFAULT_QUALITY.mp4);
  const [startError, setStartError] = useState<string | null>(null);

  // Pre-fill from the tab the popup was opened on, if it is a YouTube video.
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url && parseYouTubeUrl(tab.url)) setUrl((current) => current || tab.url!);
    });
  }, []);

  const { helper, job } = session;
  if (helper.status === 'missing') return <SetupCard lastError={helper.lastError} />;
  if (job) return <JobCard job={job} />;

  const isValid = parseYouTubeUrl(url) !== null;
  const showInvalid = url.trim() !== '' && !isValid;
  const isReady = helper.status === 'ok';

  const handleFormat = (next: DownloadFormat) => {
    setFormat(next);
    setQuality(DEFAULT_QUALITY[next]);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setStartError(null);
    const result = await command({ type: 'start', url, format, quality });
    if (!result.ok) setStartError(result.error ?? 'Could not start the download.');
  };

  return (
    <form class="stack" onSubmit={(e) => void handleSubmit(e)}>
      <div class="field">
        <label class="label" for="url">YouTube link</label>
        <input
          id="url" class="input" type="url" placeholder="https://www.youtube.com/watch?v=…"
          value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} autoFocus
        />
        {showInvalid && <span class="small error-text">That doesn't look like a YouTube video link.</span>}
      </div>

      <div class="field">
        <span class="label">Save as</span>
        <div class="segmented" role="group" aria-label="Format">
          <button type="button" aria-pressed={format === 'mp4'} onClick={() => handleFormat('mp4')}>MP4 video</button>
          <button type="button" aria-pressed={format === 'mp3'} onClick={() => handleFormat('mp3')}>MP3 audio</button>
        </div>
      </div>

      <div class="field">
        <label class="label" for="quality">Quality</label>
        <select id="quality" class="select" value={quality} onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}>
          {DOWNLOAD_QUALITIES[format].map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
        </select>
      </div>

      <button class="btn btn-primary btn-block" type="submit" disabled={!isValid || !isReady}>
        {isReady ? 'Download' : 'Connecting to helper…'}
      </button>
      {startError && <span class="small error-text">{startError}</span>}
      <UpdateNotice session={session} />
    </form>
  );
}

function UpdateNotice({ session }: Props) {
  const { updateResult, updateOutput, updating } = session.helper;
  if (updating || !updateResult) return null;
  const isOk = updateResult === 'ok';
  return (
    <div class="small">
      <span class={isOk ? 'ok-text' : 'error-text'}>{isOk ? 'yt-dlp is up to date.' : 'The yt-dlp update failed.'}</span>
      {!isOk && updateOutput && <pre class="update-output">{updateOutput}</pre>}
    </div>
  );
}
