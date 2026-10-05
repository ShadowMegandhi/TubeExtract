/**
 * State of the one YouTube download that can run at a time, and how helper
 * messages move it forward. Pure, so the service worker only does the wiring.
 */
import type { DownloadFormat, HelperMessage, JobStage } from './messages';

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface Job {
  id: string;
  url: string;
  format: DownloadFormat;
  quality: string;
  status: JobStatus;
  stage: JobStage;
  percent: number;
  startedAt: number;
  title?: string;
  speed?: string;
  eta?: string;
  path?: string;
  error?: string;
}

export function newJob(id: string, url: string, format: DownloadFormat, quality: string, now: number): Job {
  return { id, url, format, quality, status: 'running', stage: 'starting', percent: 0, startedAt: now };
}

export function applyHelperMessage(job: Job | null, msg: HelperMessage): Job | null {
  if (!job || !('id' in msg) || msg.id !== job.id || job.status !== 'running') return job;
  switch (msg.type) {
    case 'progress': {
      const next: Job = { ...job, percent: msg.percent, stage: msg.stage };
      if (msg.speed !== undefined) next.speed = msg.speed;
      if (msg.eta !== undefined) next.eta = msg.eta;
      if (msg.title !== undefined) next.title = msg.title;
      return next;
    }
    case 'done': return { ...job, status: 'done', percent: 100, path: msg.path };
    case 'error': return { ...job, status: 'error', error: msg.message };
    case 'cancelled': return { ...job, status: 'cancelled' };
    default: return job;
  }
}
