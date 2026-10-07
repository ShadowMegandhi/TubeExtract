import { useEffect, useState } from 'preact/hooks';
import type { SessionState } from '../../background/state';
import { command, useSession } from '../shared/useSession';
import { YouTubeTab } from './YouTubeTab';
import { ConvertTab } from './ConvertTab';
import { UpdateBanner } from './UpdateBanner';

type Tab = 'youtube' | 'convert';

export function App() {
  const [tab, setTab] = useState<Tab>('youtube');
  const session = useSession();

  // Ask the helper who it is every time the popup opens, so a fresh install
  // shows up without restarting Chrome.
  useEffect(() => { void command({ type: 'recheck-helper' }); }, []);

  return (
    <div class="popup">
      <header class="header">
        <img src="/icons/icon-48.png" alt="" />
        <h1>TubeExtract</h1>
      </header>
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'youtube'} onClick={() => setTab('youtube')}>YouTube link</button>
        <button role="tab" aria-selected={tab === 'convert'} onClick={() => setTab('convert')}>Convert a file</button>
      </nav>
      <UpdateBanner />
      <main class="panel">
        {tab === 'youtube'
          ? (session ? <YouTubeTab session={session} /> : <p class="muted">Loading…</p>)
          : <ConvertTab />}
      </main>
      {tab === 'youtube' && session?.helper.status === 'ok' && <Footer session={session} />}
    </div>
  );
}

function Footer({ session }: { session: SessionState }) {
  const { helper } = session;
  return (
    <footer class="footer small muted">
      <span>yt-dlp {helper.ytdlpVersion ?? '?'}</span>
      <button class="btn-link" disabled={helper.updating === true} onClick={() => void command({ type: 'update-ytdlp' })}>
        {helper.updating ? 'Updating…' : 'Update yt-dlp'}
      </button>
    </footer>
  );
}
