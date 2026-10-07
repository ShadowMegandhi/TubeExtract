/**
 * Service worker: owns the native-messaging port to tubeextract-helper and the
 * state of the current YouTube download.
 *
 * State lives in chrome.storage.session so the popup can close and reopen at
 * any time and still see live progress. The popup only reads that state and
 * sends UiCommands; every decision about the job happens in @core/job.
 *
 * An open native port keeps this worker alive, so the port is held only while
 * a download or update is running and dropped otherwise.
 */
import { HOST_NAME, type HelperMessage, type HelperRequest, type UiCommand } from '@core/messages';
import { applyHelperMessage, newJob, type Job } from '@core/job';
import { parseYouTubeUrl } from '@core/youtube';
import { isNewerVersion, LATEST_RELEASE_API, parseLatestRelease } from '@core/updates';
import { readState, writeHelper, writeJob, type HelperState } from './state';

// yt-dlp's first start can be slow, especially while antivirus scans it.
const PING_TIMEOUT_MS = 20_000;
const HOST_MISSING = /not found|forbidden|not installed|no such/i;

let port: chrome.runtime.Port | null = null;
let busyUpdating = false;
let pingTimer: ReturnType<typeof setTimeout> | null = null;

// Every state change is a read-modify-write of chrome.storage.session, so they
// all run one at a time. Otherwise two quick "start" clicks could both see no
// running job, or a stale progress write could land after "done".
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function describeDisconnect(): string {
  return chrome.runtime.lastError?.message ?? 'The helper closed unexpectedly.';
}

async function onHelperMessage(msg: HelperMessage): Promise<void> {
  if (msg.type === 'pong') {
    if (pingTimer) clearTimeout(pingTimer);
    const { helper } = await readState();
    const { lastError: _dropped, ...kept } = helper;
    await writeHelper({ ...kept, status: 'ok', helperVersion: msg.helperVersion, ytdlpVersion: msg.ytdlpVersion });
    await releaseIfIdle();
    return;
  }
  if (msg.type === 'updated') {
    busyUpdating = false;
    const { helper } = await readState();
    await writeHelper({ ...helper, updating: false, updateResult: msg.ok ? 'ok' : 'failed', updateOutput: msg.output });
    send({ type: 'ping' });
    return;
  }
  const { job } = await readState();
  if (msg.type === 'error' && msg.id === undefined) {
    await writeHelper({ ...(await readState()).helper, lastError: msg.message });
  }
  const next = applyHelperMessage(job, msg);
  if (next !== job) await writeJob(next);
  if (next && next.status !== 'running') await releaseIfIdle();
}

async function onHelperDisconnect(reason: string): Promise<void> {
  port = null;
  busyUpdating = false;
  if (pingTimer) clearTimeout(pingTimer);
  const { job, helper } = await readState();
  if (job?.status === 'running') {
    await writeJob({ ...job, status: 'error', error: `Lost contact with the helper: ${reason}` });
  }
  if (HOST_MISSING.test(reason) && helper.status !== 'ok') {
    await writeHelper({ status: 'missing', lastError: reason });
  } else if (helper.updating) {
    await writeHelper({ ...helper, updating: false, updateResult: 'failed', updateOutput: reason });
  }
}

function connect(): chrome.runtime.Port {
  if (port) return port;
  const p = chrome.runtime.connectNative(HOST_NAME);
  p.onMessage.addListener((m: HelperMessage) => void serial(() => onHelperMessage(m)));
  p.onDisconnect.addListener(() => {
    // lastError is only readable synchronously inside this callback.
    const reason = describeDisconnect();
    void serial(() => onHelperDisconnect(reason));
  });
  port = p;
  return p;
}

function send(req: HelperRequest): void {
  connect().postMessage(req);
}

async function releaseIfIdle(): Promise<void> {
  const { job } = await readState();
  if (port && job?.status !== 'running' && !busyUpdating) {
    port.disconnect();
    port = null;
  }
}

async function checkHelper(): Promise<void> {
  await writeHelper({ ...(await readState()).helper, status: 'checking' });
  send({ type: 'ping' });
  if (pingTimer) clearTimeout(pingTimer);
  pingTimer = setTimeout(() => void serial(async () => {
    const { job } = await readState();
    if (job?.status !== 'running') {
      port?.disconnect();
      port = null;
    }
    await writeHelper({ status: 'missing', lastError: 'The helper did not answer.' });
  }), PING_TIMEOUT_MS);
}

async function startDownload(cmd: Extract<UiCommand, { type: 'start' }>): Promise<string | null> {
  const video = parseYouTubeUrl(cmd.url);
  if (!video) return 'That is not a YouTube video link.';
  const { job } = await readState();
  if (job?.status === 'running') return 'A download is already running.';
  const fresh = newJob(crypto.randomUUID(), video.url, cmd.format, cmd.quality, Date.now());
  await writeJob(fresh);
  send({ type: 'download', id: fresh.id, url: fresh.url, format: fresh.format, quality: fresh.quality });
  return null;
}

async function handle(cmd: UiCommand): Promise<string | null> {
  const { job, helper } = await readState();
  switch (cmd.type) {
    case 'start': return startDownload(cmd);
    case 'cancel':
      if (job?.status === 'running') send({ type: 'cancel', id: job.id });
      return null;
    case 'reveal':
      if (job?.path) send({ type: 'reveal', path: job.path });
      return null;
    case 'update-ytdlp':
      busyUpdating = true;
      await writeHelper({ ...helper, updating: true });
      send({ type: 'update' });
      return null;
    case 'recheck-helper':
      await checkHelper();
      return null;
    case 'clear':
      if (job?.status !== 'running') await writeJob(null);
      return null;
  }
}

// Chrome never updates an unpacked extension, so check GitHub ourselves. The
// popup shows a banner when a newer release exists (see UpdateBanner).
const UPDATE_ALARM = 'check-updates';
const UPDATE_EVERY_MINUTES = 6 * 60;

async function checkForUpdates(): Promise<void> {
  const current = chrome.runtime.getManifest().version;
  try {
    const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const latest = parseLatestRelease(await res.json());
    const available = latest && isNewerVersion(current, latest.version) ? latest : null;
    await chrome.storage.local.set({ update: { available, checkedAt: Date.now() } });
  } catch {
    // Offline or rate-limited: keep whatever we knew before and try again later.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) void checkForUpdates();
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_EVERY_MINUTES });
  void checkForUpdates();
});
chrome.runtime.onStartup.addListener(() => void checkForUpdates());

chrome.runtime.onMessage.addListener((cmd: UiCommand, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  serial(() => handle(cmd)).then(
    (error) => reply({ ok: error === null, error }),
    (e: unknown) => reply({ ok: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true;
});

// A worker restart drops the port, so a job still marked running is orphaned.
void readState().then(async ({ job }: { job: Job | null; helper: HelperState }) => {
  if (job?.status === 'running' && !port) {
    await writeJob({ ...job, status: 'error', error: 'The download was interrupted. Please try again.' });
  }
});
