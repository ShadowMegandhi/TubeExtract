/**
 * Typed access to the two keys in chrome.storage.session that the popup watches.
 */
import type { Job } from '@core/job';

export interface HelperState {
  status: 'unknown' | 'checking' | 'ok' | 'missing';
  helperVersion?: string;
  ytdlpVersion?: string;
  lastError?: string;
  updating?: boolean;
  updateResult?: 'ok' | 'failed';
  updateOutput?: string;
}

export interface SessionState {
  job: Job | null;
  helper: HelperState;
}

export const UNKNOWN_HELPER: HelperState = { status: 'unknown' };

export async function readState(): Promise<SessionState> {
  const raw = await chrome.storage.session.get(['job', 'helper']);
  return {
    job: (raw['job'] as Job | undefined) ?? null,
    helper: (raw['helper'] as HelperState | undefined) ?? UNKNOWN_HELPER,
  };
}

export async function writeJob(job: Job | null): Promise<void> {
  await chrome.storage.session.set({ job });
}

export async function writeHelper(helper: HelperState): Promise<void> {
  await chrome.storage.session.set({ helper });
}
