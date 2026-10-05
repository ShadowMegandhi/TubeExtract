/**
 * Output formats for the in-browser converter, and the ffmpeg arguments for each.
 *
 * The wasm build of ffmpeg is single-threaded, so the encoder settings favour
 * speed (x264 veryfast, VP8 realtime) over squeezing out the smallest file.
 */
export type ConvertFormat = 'mp4' | 'webm' | 'mov' | 'mp3' | 'wav' | 'm4a';

export interface QualityOption {
  value: string;
  label: string;
}

export const CONVERT_FORMATS: readonly ConvertFormat[] = ['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a'];

const AUDIO: ReadonlySet<ConvertFormat> = new Set(['mp3', 'wav', 'm4a']);

const VIDEO_QUALITIES: readonly QualityOption[] = [
  { value: 'original', label: 'Original size' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
];

const AUDIO_BITRATES: readonly QualityOption[] = [
  { value: '320', label: '320 kbps (best)' },
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps (smallest)' },
];

export function isAudioFormat(format: ConvertFormat): boolean {
  return AUDIO.has(format);
}

export function qualitiesFor(format: ConvertFormat): readonly QualityOption[] {
  if (format === 'wav') return [];
  return isAudioFormat(format) ? AUDIO_BITRATES : VIDEO_QUALITIES;
}

export function defaultQuality(format: ConvertFormat): string {
  if (format === 'wav') return '';
  return isAudioFormat(format) ? '192' : 'original';
}

function scaleFilter(quality: string): string[] {
  // min(N,ih) caps the height without ever upscaling; -2 keeps width even for x264.
  return quality === 'original' ? [] : ['-vf', `scale=-2:'min(${quality},ih)'`];
}

function videoCodecArgs(format: ConvertFormat): string[] {
  if (format === 'webm') {
    return ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2M',
      '-c:a', 'libopus', '-b:a', '128k'];
  }
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k'];
  return format === 'mp4' ? [...h264, '-movflags', '+faststart'] : h264;
}

export function ffmpegArgsFor(input: string, output: string, format: ConvertFormat, quality: string): string[] {
  switch (format) {
    case 'mp3': return ['-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', `${quality}k`, output];
    case 'm4a': return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', `${quality}k`, output];
    case 'wav': return ['-i', input, '-vn', '-c:a', 'pcm_s16le', output];
    default: return ['-i', input, ...scaleFilter(quality), ...videoCodecArgs(format), output];
  }
}

/**
 * MP4 and MOV share codecs, so at original size a plain stream copy often
 * works and takes seconds instead of minutes. Returns null when a re-encode is
 * unavoidable. The caller falls back to ffmpegArgsFor if the copy fails.
 */
export function remuxArgsFor(input: string, output: string, format: ConvertFormat, quality: string): string[] | null {
  if (quality !== 'original') return null;
  if (format === 'mov') return ['-i', input, '-c', 'copy', output];
  if (format === 'mp4') return ['-i', input, '-c', 'copy', '-movflags', '+faststart', output];
  return null;
}

export function outputName(inputName: string, format: ConvertFormat): string {
  const dot = inputName.lastIndexOf('.');
  const base = dot > 0 ? inputName.slice(0, dot) : inputName;
  const sameExt = dot > 0 && inputName.slice(dot + 1).toLowerCase() === format;
  return sameExt ? `${base} (converted).${format}` : `${base}.${format}`;
}
