import type { Job } from '@core/job';
import { command } from '../shared/useSession';

type Props = { job: Job };

const STAGE_TEXT: Record<Job['stage'], string> = {
  starting: 'Looking up the video…',
  downloading: 'Downloading',
  processing: 'Finishing up (merging / converting)…',
};

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function JobCard({ job }: Props) {
  const heading = job.title ?? job.url;
  const formatLabel = job.format === 'mp3' ? `MP3 · ${job.quality} kbps` : `MP4 · ${job.quality === 'best' ? 'best' : `${job.quality}p`}`;

  return (
    <div class="stack">
      <div class="card stack" style={{ gap: '8px' }}>
        <div class="job-title truncate" title={heading}>{heading}</div>
        <div class="small muted">{formatLabel}</div>
        {job.status === 'running' && <Running job={job} />}
        {job.status === 'done' && job.path && (
          <div class="small">
            <span class="ok-text">Saved to Downloads</span>
            <div class="muted truncate" title={job.path}>{fileName(job.path)}</div>
          </div>
        )}
        {job.status === 'error' && <ErrorDetails message={job.error ?? 'Something went wrong.'} />}
        {job.status === 'cancelled' && <span class="small muted">Cancelled.</span>}
      </div>

      {job.status === 'running' && (
        <button class="btn btn-block" onClick={() => void command({ type: 'cancel' })}>Cancel</button>
      )}
      {job.status === 'done' && (
        <div class="row">
          <button class="btn" style={{ flex: 1 }} onClick={() => void command({ type: 'reveal' })}>Show in folder</button>
          <button class="btn btn-primary" style={{ flex: 1 }} onClick={() => void command({ type: 'clear' })}>Download another</button>
        </div>
      )}
      {(job.status === 'error' || job.status === 'cancelled') && (
        <button class="btn btn-primary btn-block" onClick={() => void command({ type: 'clear' })}>Try another link</button>
      )}
    </div>
  );
}

function Running({ job }: Props) {
  const isIndeterminate = job.stage !== 'downloading';
  return (
    <>
      <div class={isIndeterminate ? 'progress progress-indeterminate' : 'progress'}>
        <div style={{ width: `${Math.min(100, Math.max(0, job.percent))}%` }} />
      </div>
      <div class="job-meta small muted">
        <span>{STAGE_TEXT[job.stage]}{job.stage === 'downloading' ? ` ${job.percent.toFixed(0)}%` : ''}</span>
        <span>{[job.speed, job.eta && `${job.eta} left`].filter(Boolean).join(' · ')}</span>
      </div>
    </>
  );
}

function ErrorDetails({ message }: { message: string }) {
  return (
    <div class="small">
      <div class="error-text">{message}</div>
      <div class="muted" style={{ marginTop: '6px' }}>
        YouTube changes often. If this keeps happening, click <b>Update yt-dlp</b> below and try again.
      </div>
    </div>
  );
}
