/**
 * Update check against GitHub Releases. Chrome never auto-updates an unpacked
 * extension, so the popup has to tell people a newer version exists.
 */
export const REPO = 'ShadowMegandhi/TubeExtract';
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export interface LatestRelease {
  version: string;
  pageUrl: string;
  zipUrl: string | null;
}

function parts(version: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewerVersion(current: string, latest: string): boolean {
  const a = parts(current);
  const b = parts(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i]! !== a[i]!) return b[i]! > a[i]!;
  }
  return false;
}

const GITHUB_URL = /^https:\/\/(github\.com|objects\.githubusercontent\.com)\//;

/** Reads only what the popup needs from GitHub's release JSON; anything odd is dropped. */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r['draft'] === true || r['prerelease'] === true) return null;
  if (typeof r['tag_name'] !== 'string' || typeof r['html_url'] !== 'string') return null;
  if (!GITHUB_URL.test(r['html_url'])) return null;
  const assets = Array.isArray(r['assets']) ? (r['assets'] as Record<string, unknown>[]) : [];
  const zip = assets.find((a) => typeof a['name'] === 'string' && /^tubeextract-extension-.*\.zip$/.test(a['name']));
  const zipUrl = zip && typeof zip['browser_download_url'] === 'string' && GITHUB_URL.test(zip['browser_download_url'])
    ? zip['browser_download_url'] : null;
  return { version: r['tag_name'], pageUrl: r['html_url'], zipUrl };
}
