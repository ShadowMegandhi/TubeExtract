import { describe, expect, test } from 'vitest';
import { isNewerVersion, parseLatestRelease } from '@core/updates';

describe('isNewerVersion', () => {
  test.each([
    ['0.3.1', 'v0.3.2', true],
    ['0.3.1', '0.4.0', true],
    ['0.3.1', 'v1.0.0', true],
    ['0.3.1', 'v0.3.1', false],
    ['0.3.1', 'v0.3.0', false],
    ['0.10.0', 'v0.9.9', false],
    ['0.9.9', 'v0.10.0', true],
  ])('%s -> %s is newer: %s', (current, latest, want) => {
    expect(isNewerVersion(current, latest)).toBe(want);
  });

  test('garbage never counts as an update', () => {
    expect(isNewerVersion('0.3.1', 'latest')).toBe(false);
    expect(isNewerVersion('0.3.1', '')).toBe(false);
  });
});

describe('parseLatestRelease', () => {
  const api = {
    tag_name: 'v0.4.0',
    html_url: 'https://github.com/ShadowMegandhi/TubeExtract/releases/tag/v0.4.0',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'SHA256SUMS.txt', browser_download_url: 'https://x/SHA256SUMS.txt' },
      { name: 'tubeextract-extension-v0.4.0.zip', browser_download_url: 'https://github.com/x/ext.zip' },
      { name: 'tubeextract-helper-windows-x64.exe', browser_download_url: 'https://github.com/x/helper.exe' },
    ],
  };

  test('picks the tag, page and extension zip', () => {
    expect(parseLatestRelease(api)).toEqual({
      version: 'v0.4.0',
      pageUrl: api.html_url,
      zipUrl: 'https://github.com/x/ext.zip',
    });
  });

  test('rejects drafts, prereleases and malformed responses', () => {
    expect(parseLatestRelease({ ...api, draft: true })).toBeNull();
    expect(parseLatestRelease({ ...api, prerelease: true })).toBeNull();
    expect(parseLatestRelease({ tag_name: 1 })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({ ...api, html_url: 'http://evil.example/x' })).toBeNull();
  });

  test('a release without the zip still links to the page', () => {
    expect(parseLatestRelease({ ...api, assets: [] })).toEqual({ version: 'v0.4.0', pageUrl: api.html_url, zipUrl: null });
  });
});
