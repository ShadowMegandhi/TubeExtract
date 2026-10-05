import { command } from '../shared/useSession';

export const RELEASES_URL = 'https://github.com/ShadowMegandhi/tubeshift/releases/latest';

type Props = { lastError: string | undefined };

export function SetupCard({ lastError }: Props) {
  return (
    <div class="stack setup">
      <div class="card card-warn">
        <b>One-time setup needed for YouTube</b>
        <p class="small" style={{ margin: '6px 0 0' }}>
          Chrome can't save YouTube videos by itself, so TubeShift uses a small free helper app on your computer.
        </p>
        <ol class="small">
          <li>
            Download <b>tubeshift-helper</b> for your system from the{' '}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">latest release</a>.
          </li>
          <li>
            Open it once. It sets itself up and says "All done".
            <span class="muted"> (Windows may warn it's unrecognised: click <b>More info → Run anyway</b>.)</span>
          </li>
          <li>Click <b>Check again</b> below.</li>
        </ol>
        <button class="btn btn-block" onClick={() => void command({ type: 'recheck-helper' })}>Check again</button>
      </div>
      <p class="small muted" style={{ margin: 0 }}>
        Converting files doesn't need the helper. Use the <b>Convert a file</b> tab.
      </p>
      {lastError && <p class="small muted" style={{ margin: 0 }}>Details: {lastError}</p>}
    </div>
  );
}
