/**
 * Recognises a single YouTube video link and reduces it to a canonical watch URL.
 *
 * Only this canonical form is ever handed to the helper, which checks it again,
 * so whatever the user pastes cannot smuggle extra arguments or other sites in.
 */
export interface YouTubeVideo {
  videoId: string;
  url: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const PATH_PREFIXES = ['/shorts/', '/live/', '/embed/'];

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function idFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] ?? null;
  if (!WATCH_HOSTS.has(host)) return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
  return prefix ? (url.pathname.slice(prefix.length).split('/')[0] ?? null) : null;
}

export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const url = toUrl(input);
  if (!url) return null;
  const id = idFromUrl(url);
  if (!id || !VIDEO_ID.test(id)) return null;
  return { videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
}
