import { describe, expect, test } from 'vitest';
import {
  CONVERT_FORMATS, defaultQuality, ffmpegArgsFor, isAudioFormat, outputName, qualitiesFor, remuxArgsFor,
} from '@core/formats';

describe('formats', () => {
  test('lists the six conversion targets', () => {
    expect(CONVERT_FORMATS).toEqual(['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a']);
  });

  test('classifies audio formats', () => {
    expect(isAudioFormat('mp3')).toBe(true);
    expect(isAudioFormat('wav')).toBe(true);
    expect(isAudioFormat('m4a')).toBe(true);
    expect(isAudioFormat('mp4')).toBe(false);
  });

  test('offers resolutions for video, bitrates for lossy audio, nothing for wav', () => {
    expect(qualitiesFor('mp4').map((q) => q.value)).toEqual(['original', '1080', '720', '480', '360']);
    expect(qualitiesFor('mp3').map((q) => q.value)).toEqual(['320', '192', '128']);
    expect(qualitiesFor('wav')).toEqual([]);
  });

  test('defaults are the first sensible option', () => {
    expect(defaultQuality('mp4')).toBe('original');
    expect(defaultQuality('m4a')).toBe('192');
    expect(defaultQuality('wav')).toBe('');
  });
});

describe('ffmpegArgsFor', () => {
  test('mp3 drops video and uses lame at the chosen bitrate', () => {
    expect(ffmpegArgsFor('in.mp4', 'out.mp3', 'mp3', '320')).toEqual(
      ['-i', 'in.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', 'out.mp3'],
    );
  });

  test('m4a uses aac', () => {
    expect(ffmpegArgsFor('a.wav', 'b.m4a', 'm4a', '128')).toEqual(
      ['-i', 'a.wav', '-vn', '-c:a', 'aac', '-b:a', '128k', 'b.m4a'],
    );
  });

  test('wav is 16-bit pcm and ignores quality', () => {
    expect(ffmpegArgsFor('a.mp3', 'b.wav', 'wav', '320')).toEqual(
      ['-i', 'a.mp3', '-vn', '-c:a', 'pcm_s16le', 'b.wav'],
    );
  });

  test('mp4 encodes h264/aac with faststart and keeps size at original', () => {
    expect(ffmpegArgsFor('a.mov', 'b.mp4', 'mp4', 'original')).toEqual([
      '-i', 'a.mov',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'b.mp4',
    ]);
  });

  test('a resolution cap scales down but never up', () => {
    const args = ffmpegArgsFor('a.mov', 'b.mov', 'mov', '720');
    expect(args).toContain("scale=-2:'min(720,ih)'");
    expect(args[args.indexOf('-vf') - 1]).toBe('a.mov');
    expect(args).not.toContain('-movflags');
  });

  test('webm uses vp8 realtime and opus', () => {
    const args = ffmpegArgsFor('a.mp4', 'b.webm', 'webm', '480');
    expect(args).toEqual(expect.arrayContaining(['libvpx', 'realtime', 'libopus']));
    expect(args).toContain("scale=-2:'min(480,ih)'");
  });
});

describe('remuxArgsFor', () => {
  test('mp4/mov at original size can try a stream copy first', () => {
    expect(remuxArgsFor('a.mp4', 'b.mov', 'mov', 'original')).toEqual(['-i', 'a.mp4', '-c', 'copy', 'b.mov']);
    expect(remuxArgsFor('a.mov', 'b.mp4', 'mp4', 'original'))
      .toEqual(['-i', 'a.mov', '-c', 'copy', '-movflags', '+faststart', 'b.mp4']);
  });

  test('anything that needs re-encoding has no remux shortcut', () => {
    expect(remuxArgsFor('a.mp4', 'b.mp4', 'mp4', '720')).toBeNull();
    expect(remuxArgsFor('a.mp4', 'b.webm', 'webm', 'original')).toBeNull();
    expect(remuxArgsFor('a.mp4', 'b.mp3', 'mp3', '192')).toBeNull();
  });
});

describe('outputName', () => {
  test('swaps the extension', () => {
    expect(outputName('holiday clip.MOV', 'mp4')).toBe('holiday clip.mp4');
    expect(outputName('song.final.wav', 'mp3')).toBe('song.final.mp3');
  });

  test('handles names without an extension', () => {
    expect(outputName('recording', 'm4a')).toBe('recording.m4a');
  });

  test('never produces the same name as the input', () => {
    expect(outputName('talk.mp4', 'mp4')).toBe('talk (converted).mp4');
  });
});
