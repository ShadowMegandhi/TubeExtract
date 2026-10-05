import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve('dist');
const EXTENSION_ID = 'mipkkpejehmafkadcbfiiecngoghaook';
const BASE = `chrome-extension://${EXTENSION_ID}`;
const HELPER = join(process.env['LOCALAPPDATA'] ?? '', 'TubeShift', 'tubeshift-helper.exe');

let context: BrowserContext;
let media: string;

function probe(file: string): string {
  return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,height', '-of', 'csv=p=0', file])
    .toString().trim().replace(/\r?\n/g, ' ');
}

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tubeshift-e2e-'));
  media = join(dir, 'sample clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', media]);
  context = await chromium.launchPersistentContext(join(dir, 'profile'), {
    channel: 'chromium',
    acceptDownloads: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
});

test.afterAll(async () => { await context?.close(); });

async function lastDownload(page: Page): Promise<string> {
  const path = await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const [item] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
      if (item?.state === 'complete') return item.filename;
      await new Promise((r) => setTimeout(r, 200));
    }
    return '';
  });
  expect(path, 'download should complete').not.toBe('');
  return path;
}

test('the extension loads with its fixed ID', async () => {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  expect(worker.url()).toBe(`${BASE}/background.js`);
});

// [button, exact quality option label ('' = no picker), expected ffprobe codecs]
const conversions: Array<[string, string, RegExp]> = [
  ['MP3', '192 kbps', /^mp3/],
  ['WAV', '', /^pcm_s16le/],
  ['MOV', 'Original size', /^h264,360 aac/],
  ['WEBM', '480p', /^vp8,360 opus/],
  ['MP4', '720p', /^h264,360 aac/],
];

for (const [format, quality, expected] of conversions) {
  test(`converter: MP4 -> ${format}`, async () => {
    const page = await context.newPage();
    await page.goto(`${BASE}/src/ui/converter/converter.html`);
    await page.locator('input[type=file]').first().setInputFiles(media);
    await expect(page.getByText('sample clip.mp4')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`^${format}`) }).click();
    if (quality) await page.locator('#quality').selectOption({ label: quality });
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByText('Done! Saved to your Downloads:')).toBeVisible({ timeout: 4 * 60_000 });
    // Playwright stores accepted downloads under GUID names, so the user-facing
    // name is checked on the page and the file's contents with ffprobe.
    const ext = format.toLowerCase();
    const expectedName = ext === 'mp4' ? 'sample clip (converted).mp4' : `sample clip.${ext}`;
    await expect(page.getByText(expectedName, { exact: true })).toBeVisible();
    expect(probe(await lastDownload(page))).toMatch(expected);
    await page.close();
  });
}

test('popup: shows the setup card or the helper version', async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/src/ui/popup/popup.html`);
  if (existsSync(HELPER)) {
    await expect(page.getByText(/^yt-dlp \d{4}\./)).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText('One-time setup needed for YouTube')).toBeVisible({ timeout: 30_000 });
  }
  await page.close();
});

test('popup: rejects a non-YouTube link', async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/src/ui/popup/popup.html`);
  await page.locator('#url').fill('https://vimeo.com/123');
  await expect(page.getByText("That doesn't look like a YouTube video link.")).toBeVisible();
  await expect(page.getByRole('button', { name: /Download|Connecting/ })).toBeDisabled();
  await page.close();
});

test('popup: downloads a YouTube video as MP3 through the helper', async () => {
  test.skip(!existsSync(HELPER), 'helper not installed on this machine');
  const page = await context.newPage();
  await page.goto(`${BASE}/src/ui/popup/popup.html`);
  await page.locator('#url').fill('https://youtu.be/jNQXAC9IVRw');
  await page.getByRole('button', { name: 'MP3 audio' }).click();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Saved to Downloads')).toBeVisible({ timeout: 4 * 60_000 });
  const saved = await page.locator('.job-title').textContent();
  expect(saved).toBe('Me at the zoo');
  await page.getByRole('button', { name: 'Download another' }).click();
  await expect(page.locator('#url')).toBeVisible();
  await page.close();
});
