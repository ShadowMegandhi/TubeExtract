/**
 * Thin wrapper over ffmpeg.wasm for one conversion at a time.
 *
 * The input file is mounted with WORKERFS, so ffmpeg reads it straight from
 * disk instead of copying the whole thing into wasm memory first. Only the
 * output lives in memory, which is what bounds the practical file size.
 */
import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg';
import { ffmpegArgsFor, remuxArgsFor, type ConvertFormat } from '@core/formats';

const INPUT_DIR = '/input';
const LOG_TAIL = 15;

export type Stage = 'loading' | 'converting' | 'reencoding';

export interface ConvertCallbacks {
  onStage: (stage: Stage) => void;
  onProgress: (ratio: number) => void;
}

export class ConversionError extends Error {
  constructor(message: string, readonly log: string) {
    super(message);
  }
}

export interface Engine {
  convert: (file: File, format: ConvertFormat, quality: string, cb: ConvertCallbacks) => Promise<Blob>;
  cancel: () => void;
}

const MIME: Record<ConvertFormat, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
};

export function createEngine(): Engine {
  let ffmpeg: FFmpeg | null = null;
  let log: string[] = [];
  let progressCb: ((ratio: number) => void) | null = null;

  async function ensureLoaded(): Promise<FFmpeg> {
    if (ffmpeg) return ffmpeg;
    const f = new FFmpeg();
    f.on('log', ({ message }) => { log = [...log.slice(-(LOG_TAIL - 1)), message]; });
    f.on('progress', ({ progress }) => progressCb?.(Math.min(1, Math.max(0, progress))));
    await f.load({
      coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'),
      wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm'),
    });
    ffmpeg = f;
    return f;
  }

  async function run(f: FFmpeg, args: string[], output: string): Promise<boolean> {
    log = [];
    await f.deleteFile(output).catch(() => undefined);
    return (await f.exec(args)) === 0;
  }

  async function convert(file: File, format: ConvertFormat, quality: string, cb: ConvertCallbacks): Promise<Blob> {
    cb.onStage('loading');
    const f = await ensureLoaded();
    progressCb = cb.onProgress;
    await f.createDir(INPUT_DIR).catch(() => undefined);
    await f.mount(FFFSType.WORKERFS, { files: [file] }, INPUT_DIR);
    const input = `${INPUT_DIR}/${file.name}`;
    const output = `output.${format}`;
    try {
      cb.onStage('converting');
      const remux = remuxArgsFor(input, output, format, quality);
      let ok = remux ? await run(f, remux, output) : false;
      if (!ok) {
        if (remux) cb.onStage('reencoding');
        ok = await run(f, ffmpegArgsFor(input, output, format, quality), output);
      }
      if (!ok) throw new ConversionError("ffmpeg couldn't convert this file.", log.join('\n'));
      const data = await f.readFile(output);
      await f.deleteFile(output);
      // readFile hands back a fresh, non-shared buffer; the cast only narrows the type.
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[format] });
    } finally {
      progressCb = null;
      await f.unmount(INPUT_DIR).catch(() => undefined);
    }
  }

  function cancel(): void {
    // terminate() kills the worker mid-exec; the next convert loads a fresh one.
    ffmpeg?.terminate();
    ffmpeg = null;
  }

  return { convert, cancel };
}
