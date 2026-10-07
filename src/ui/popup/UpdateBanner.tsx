import { useEffect, useState } from 'preact/hooks';
import { isNewerVersion, RELEASES_PAGE, type LatestRelease } from '@core/updates';

interface UpdateRecord {
  available: LatestRelease | null;
  checkedAt: number;
}

async function readUpdate(): Promise<{ update: UpdateRecord | null; dismissed: string | null }> {
  const raw = await chrome.storage.local.get(['update', 'updateDismissed']);
  return {
    update: (raw['update'] as UpdateRecord | undefined) ?? null,
    dismissed: (raw['updateDismissed'] as string | undefined) ?? null,
  };
}

export function UpdateBanner() {
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    const refresh = () => void readUpdate().then(({ update, dismissed }) => {
      const current = chrome.runtime.getManifest().version;
      const next = update?.available ?? null;
      const isWanted = next !== null && next.version !== dismissed && isNewerVersion(current, next.version);
      setRelease(isWanted ? next : null);
    });
    refresh();
    chrome.storage.local.onChanged.addListener(refresh);
    return () => chrome.storage.local.onChanged.removeListener(refresh);
  }, []);

  if (!release) return null;

  const handleLater = () => void chrome.storage.local.set({ updateDismissed: release.version });

  return (
    <div class="update-banner small">
      <div>
        <b>Update available: {release.version}</b>
        <div class="muted">Download the zip, unzip it over your TubeExtract folder, then click ↻ on chrome://extensions.</div>
      </div>
      <div class="row">
        <a class="btn btn-primary" href={release.zipUrl ?? release.pageUrl} target="_blank" rel="noopener noreferrer">Download</a>
        <a class="btn-link" href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer">What's new</a>
        <button class="btn-link muted" onClick={handleLater}>Later</button>
      </div>
    </div>
  );
}
