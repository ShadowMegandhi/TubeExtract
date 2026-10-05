/**
 * Live view of the service worker's session state, for the popup.
 */
import { useEffect, useState } from 'preact/hooks';
import type { UiCommand } from '@core/messages';
import { readState, type SessionState } from '../../background/state';

export function useSession(): SessionState | null {
  const [state, setState] = useState<SessionState | null>(null);
  useEffect(() => {
    const refresh = () => void readState().then(setState);
    refresh();
    chrome.storage.session.onChanged.addListener(refresh);
    return () => chrome.storage.session.onChanged.removeListener(refresh);
  }, []);
  return state;
}

export interface CommandResult {
  ok: boolean;
  error: string | null;
}

export async function command(cmd: UiCommand): Promise<CommandResult> {
  try {
    return (await chrome.runtime.sendMessage(cmd)) as CommandResult;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
