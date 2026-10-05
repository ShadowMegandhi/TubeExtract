/**
 * The native-messaging protocol between the extension and tubeshift-helper.
 * helper/protocol.go mirrors these shapes; change both together.
 */
export const HOST_NAME = 'com.tubeshift.helper';

export type DownloadFormat = 'mp4' | 'mp3';

export const DOWNLOAD_QUALITIES: Readonly<Record<DownloadFormat, readonly { value: string; label: string }[]>> = {
  mp4: [
    { value: 'best', label: 'Best available' },
    { value: '1080', label: '1080p' },
    { value: '720', label: '720p' },
    { value: '480', label: '480p' },
    { value: '360', label: '360p' },
  ],
  mp3: [
    { value: '320', label: '320 kbps' },
    { value: '192', label: '192 kbps' },
    { value: '128', label: '128 kbps' },
  ],
};

export type HelperRequest =
  | { type: 'ping' }
  | { type: 'download'; id: string; url: string; format: DownloadFormat; quality: string }
  | { type: 'cancel'; id: string }
  | { type: 'reveal'; path: string }
  | { type: 'update' };

export type JobStage = 'starting' | 'downloading' | 'processing';

export type HelperMessage =
  | { type: 'pong'; helperVersion: string; ytdlpVersion: string }
  | { type: 'progress'; id: string; percent: number; stage: JobStage; speed?: string; eta?: string; title?: string }
  | { type: 'done'; id: string; path: string }
  | { type: 'cancelled'; id: string }
  | { type: 'error'; id?: string; message: string }
  | { type: 'updated'; ok: boolean; output: string };

/** Popup -> service worker. */
export type UiCommand =
  | { type: 'start'; url: string; format: DownloadFormat; quality: string }
  | { type: 'cancel' }
  | { type: 'reveal' }
  | { type: 'update-ytdlp' }
  | { type: 'recheck-helper' }
  | { type: 'clear' };
