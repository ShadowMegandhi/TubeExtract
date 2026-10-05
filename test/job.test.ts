import { describe, expect, test } from 'vitest';
import { applyHelperMessage, newJob, type Job } from '@core/job';

const running = (): Job => newJob('j1', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'mp4', '720', 1000);

describe('job reducer', () => {
  test('a new job starts at zero', () => {
    expect(running()).toMatchObject({ id: 'j1', status: 'running', percent: 0, stage: 'starting', startedAt: 1000 });
  });

  test('progress updates percent, speed, eta and title', () => {
    const j = applyHelperMessage(running(), {
      type: 'progress', id: 'j1', percent: 41.5, speed: '2.1MiB/s', eta: '00:12', stage: 'downloading', title: 'Song',
    });
    expect(j).toMatchObject({ percent: 41.5, speed: '2.1MiB/s', eta: '00:12', stage: 'downloading', title: 'Song' });
  });

  test('progress without a title keeps the old one', () => {
    let j = applyHelperMessage(running(), { type: 'progress', id: 'j1', percent: 1, stage: 'downloading', title: 'A' });
    j = applyHelperMessage(j, { type: 'progress', id: 'j1', percent: 2, stage: 'downloading' });
    expect(j?.title).toBe('A');
  });

  test('done marks complete with the file path', () => {
    const j = applyHelperMessage(running(), { type: 'done', id: 'j1', path: 'C:\\Users\\x\\Downloads\\a.mp4' });
    expect(j).toMatchObject({ status: 'done', percent: 100, path: 'C:\\Users\\x\\Downloads\\a.mp4' });
  });

  test('error and cancelled are terminal', () => {
    expect(applyHelperMessage(running(), { type: 'error', id: 'j1', message: 'boom' }))
      .toMatchObject({ status: 'error', error: 'boom' });
    expect(applyHelperMessage(running(), { type: 'cancelled', id: 'j1' })).toMatchObject({ status: 'cancelled' });
  });

  test('messages for another job are ignored', () => {
    const j = running();
    expect(applyHelperMessage(j, { type: 'done', id: 'other', path: 'x' })).toBe(j);
  });

  test('a finished job ignores late progress', () => {
    const done = applyHelperMessage(running(), { type: 'done', id: 'j1', path: 'x' })!;
    expect(applyHelperMessage(done, { type: 'progress', id: 'j1', percent: 5, stage: 'downloading' })).toBe(done);
  });

  test('no job stays no job', () => {
    expect(applyHelperMessage(null, { type: 'done', id: 'j1', path: 'x' })).toBeNull();
  });

  test('the reducer never mutates its input', () => {
    const j = Object.freeze(running());
    expect(() => applyHelperMessage(j, { type: 'progress', id: 'j1', percent: 3, stage: 'downloading' })).not.toThrow();
  });
});
