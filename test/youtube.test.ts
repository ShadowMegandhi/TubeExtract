import { describe, expect, test } from 'vitest';
import { parseYouTubeUrl } from '@core/youtube';

const ID = 'dQw4w9WgXcQ';
const canonical = `https://www.youtube.com/watch?v=${ID}`;

describe('parseYouTubeUrl', () => {
  test.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `  youtu.be/${ID}  `,
  ])('accepts %s', (input) => {
    expect(parseYouTubeUrl(input)).toEqual({ videoId: ID, url: canonical });
  });

  test.each([
    '',
    'not a url',
    `https://vimeo.com/${ID}`,
    `https://www.youtube.com.evil.com/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/playlist?list=PL123`,
    `https://www.youtube.com/@somechannel`,
    `https://youtu.be/`,
    `ftp://youtu.be/${ID}`,
    `javascript:alert(1)//youtu.be/${ID}`,
  ])('rejects %s', (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});
