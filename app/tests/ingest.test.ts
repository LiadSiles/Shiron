import { describe, expect, it } from 'vitest';
import { canStart, extensionOf, failedConversion, shareBundle, shareFileName, shareMimeType, youtubeShareText, fallbackTitle, isMediaFile, isNativelyPlayable, isPreparing, canTranscribe, keepCategories, mimeOf, windowsMediaFormat, isFailed, youtubeIdFrom } from '../src/core/ingestRules';
import { NOW } from './fixtures';

describe('ingest rules', () => {
  it('parses youtube links', () => {
    expect(youtubeIdFrom('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('תראי שיר יפה https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFrom('https://example.com')).toBeNull();
  });
  it('turns WhatsApp file names into a readable title', () => {
    expect(fallbackTitle('PTT-20251012-WA0014.opus', NOW)).toBe('הקלטה מ-12.10.2025');
    expect(fallbackTitle('שיר_לחנוכה.mp3', NOW)).toBe('שיר לחנוכה');
  });
  it('iOS cannot play opus before conversion', () => {
    expect(isNativelyPlayable('PTT-1.opus', 'ios')).toBe(false);
    expect(isNativelyPlayable('PTT-1.opus', 'android')).toBe(true);
    expect(isNativelyPlayable('song.mp3', 'ios')).toBe(true);
  });
  it('keeps at most three suggestions, at least one', () => {
    expect(keepCategories([{ id: 'a', confidence: 0.2 }, { id: 'b', confidence: 0.1 }]).map((c) => c.id)).toEqual(['a']);
    expect(keepCategories([{ id: 'a', confidence: 0.9 }, { id: 'b', confidence: 0.7 }, { id: 'c', confidence: 0.6 }, { id: 'd', confidence: 0.55 }])).toHaveLength(3);
  });
});

describe('preparing', () => {
  it('only audio still being converted', () => {
    expect(isPreparing({ kind: 'audio', audioState: 'raw', playableUri: null })).toBe(true);
    expect(isPreparing({ kind: 'audio', audioState: 'raw', playableUri: 'songs/a.mp3' })).toBe(false);
    expect(isPreparing({ kind: 'youtube', audioState: 'raw', playableUri: null })).toBe(false);
  });
});

describe('transcribing again', () => {
  const base = { kind: 'audio', playableUri: null, originalUri: null, youtubeId: null };
  it('needs a file, or a YouTube video', () => {
    expect(canTranscribe({ ...base, playableUri: 'songs/a.m4a' })).toBe(true);
    expect(canTranscribe({ ...base, originalUri: 'songs/a-original.opus' })).toBe(true);
    expect(canTranscribe(base)).toBe(false);
    expect(canTranscribe({ ...base, kind: 'youtube', youtubeId: 'dQw4w9WgXcQ' })).toBe(true);
  });
});

describe('formats', () => {
  it('accepts audio and video from WhatsApp and the Files app', () => {
    for (const [name, mime] of [
      ['PTT-20251012-WA0014.opus', 'audio/ogg'], ['a.mp3', 'audio/mpeg'], ['a.m4a', null], ['a.amr', null],
      ['clip.mp4', 'video/mp4'], ['clip.mpeg', null], ['clip.3gp', null], ['x.bin', 'application/ogg'],
    ] as const) {
      expect(isMediaFile(name, mime), name).toBe(true);
    }
    expect(isMediaFile('notes.pdf', 'application/pdf')).toBe(false);
    expect(isMediaFile('photo.jpg', 'image/jpeg')).toBe(false);
  });

  it('knows which songs can be tried again', () => {
    const base = { kind: 'audio' as const, audioState: 'done' as const, originalUri: null, error: null };
    expect(isFailed(base)).toBe(false);
    expect(isFailed({ ...base, audioState: 'unsupported', originalUri: 'songs/a.mpg' })).toBe(true);
    expect(isFailed({ ...base, audioState: 'unsupported' })).toBe(false); // nothing left to convert
    expect(isFailed({ ...base, error: 'Gemini gave no answer' })).toBe(true);
  });

  it('accepts Windows Media (our own decoder) and knows it as such', () => {
    expect(isMediaFile('שיר.WMA', null)).toBe(true);
    expect(isMediaFile('clip.wmv', 'video/x-ms-wmv')).toBe(true);
    expect(isNativelyPlayable('שיר.wma', 'ios')).toBe(false);
    expect(windowsMediaFormat('x', 'audio/x-ms-wma')).toBe('WMA');
    expect(windowsMediaFormat('clip.asf', null)).toBe('WMV');
    expect(windowsMediaFormat('a.mp3', 'audio/mpeg')).toBeNull();
  });

  it('plays only what the platform reads before conversion', () => {
    expect(isNativelyPlayable('a.flac', 'ios')).toBe(false);
    expect(isNativelyPlayable('a.flac', 'android')).toBe(true);
    expect(isNativelyPlayable('clip.mp4', 'ios')).toBe(false);
  });

  it('sends the right MIME type with uploads', () => {
    expect(mimeOf('x.m4a')).toBe('audio/mp4');
    expect(mimeOf('x.aac')).toBe('audio/aac'); // what the iPhone shares out
    expect(mimeOf('x.opus')).toBe('audio/ogg');
    expect(mimeOf('x.zzz')).toBe('application/octet-stream');
  });

  it('knows which songs can start now', () => {
    expect(canStart({ kind: 'youtube', playableUri: null })).toBe(true);
    expect(canStart({ kind: 'audio', playableUri: 'songs/a.m4a' })).toBe(true);
    expect(canStart({ kind: 'audio', playableUri: null })).toBe(false);
  });
});

describe('file extensions', () => {
  it('reads the last extension, any case, ignoring a query string', () => {
    expect(extensionOf('Song.MP3')).toBe('mp3');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('https://x.example/a.m4a?token=1')).toBe('m4a');
  });
  it('is empty when there is none', () => {
    expect(extensionOf('recording')).toBe('');
    expect(extensionOf('')).toBe('');
    expect(extensionOf('.')).toBe('');
  });
});

describe('sharing a song', () => {
  it('sends the file under her title', () => {
    expect(shareFileName('בוקר טוב לגן', 'm4a')).toBe('בוקר טוב לגן.m4a');
  });
  it('drops characters file systems refuse and stray dots', () => {
    expect(shareFileName('שיר: "גשם" / חורף?', 'm4a')).toBe('שיר גשם חורף.m4a');
    expect(shareFileName('...שיר...', '.mp3')).toBe('שיר.mp3');
  });
  it('never sends a nameless or endless file name', () => {
    expect(shareFileName('  ', 'm4a')).toBe('שיר.m4a');
    expect(shareFileName('א'.repeat(200), 'm4a')).toBe('א'.repeat(80) + '.m4a');
    expect(shareFileName('שיר', '')).toBe('שיר.m4a');
  });
  it('sends a YouTube song as its title and a short link', () => {
    expect(youtubeShareText('שיר הגשם', 'dQw4w9WgXcQ')).toBe('שיר הגשם\nhttps://youtu.be/dQw4w9WgXcQ');
  });
});

describe('names that are not names', () => {
  it('never titles a song with an Android content id', () => {
    for (const n of ['msf:1000000019', 'audio:42', 'document:1234.mp3']) {
      expect(fallbackTitle(n, NOW), n).toMatch(/^הקלטה מ-/);
    }
  });
  it('keeps real names that happen to have a colon', () => {
    expect(fallbackTitle('שיר: גשם.mp3', NOW)).toBe('שיר: גשם');
  });
});

describe('a file the phone could not convert', () => {
  it('stays playable only when it is merely too long', () => {
    expect(failedConversion('TOO_LONG', 'a.mp3')).toEqual({ error: 'ההקלטה ארוכה משעה', keepOriginalPlayable: true });
    expect(failedConversion('UNSUPPORTED', 'broken.mp3').keepOriginalPlayable).toBe(false);
    expect(failedConversion('CORRUPT', 'x.m4a').keepOriginalPlayable).toBe(false);
    expect(failedConversion(null, 'x.m4a').keepOriginalPlayable).toBe(false);
  });
  it('says what went wrong, in her words', () => {
    expect(failedConversion('NO_AUDIO', 'clip.mp4').error).toBe('אין בקובץ שמע');
    expect(failedConversion('UNSUPPORTED', 'old.wma').error).toContain('WMA');
    expect(failedConversion('UNSUPPORTED', 'clip.wmv').error).toContain('WMV');
    expect(failedConversion('CORRUPT', 'broken.mp3').error).toBe('הפורמט לא נתמך במכשיר הזה, או שהקובץ פגום');
  });
});

describe('sharing a whole list or category', () => {
  const audio = (id: string, title: string, fileExt: string | null = 'm4a') => ({ id, title, kind: 'audio' as const, youtubeId: null, fileExt });
  const yt = (id: string, title: string, youtubeId: string | null = 'dQw4w9WgXcQ') => ({ id, title, kind: 'youtube' as const, youtubeId, fileExt: null });

  it('sends audio songs as files and YouTube songs as links', () => {
    const b = shareBundle([audio('a', 'בוקר טוב'), yt('y', 'שיר מיוטיוב'), audio('b', 'גשם')]);
    expect(b.files).toEqual([{ songId: 'a', fileName: 'בוקר טוב.m4a' }, { songId: 'b', fileName: 'גשם.m4a' }]);
    expect(b.text).toBe('שיר מיוטיוב\nhttps://youtu.be/dQw4w9WgXcQ');
    expect(b.notReady).toBe(0);
  });

  it('gives two songs with the same name two files', () => {
    const b = shareBundle([audio('a', 'גשם'), audio('b', 'גשם'), audio('c', 'גשם'), audio('d', 'גשם', 'mp3')]);
    expect(b.files.map((f) => f.fileName)).toEqual(['גשם.m4a', 'גשם (2).m4a', 'גשם (3).m4a', 'גשם.mp3']);
  });

  it('counts songs with nothing to send yet, and sends no text without YouTube songs', () => {
    const b = shareBundle([audio('a', 'א', null), yt('y', 'י', null), audio('b', 'ב')]);
    expect(b.files).toHaveLength(1);
    expect(b.text).toBeNull();
    expect(b.notReady).toBe(2);
  });

  it('is empty for an empty list', () => {
    expect(shareBundle([])).toEqual({ files: [], text: null, notReady: 0 });
  });

  it('labels the files with one type', () => {
    expect(shareMimeType(['a.m4a', 'b.m4a'])).toBe('audio/mp4');
    expect(shareMimeType(['a.m4a', 'b.mp3'])).toBe('audio/*');
    expect(shareMimeType(['a.m4a', 'b.mpg'])).toBe('*/*');
  });
});

describe('a conversion that failed because the phone is full', () => {
  it('says so and keeps what played before, instead of calling the file damaged', () => {
    const r = failedConversion('FAILED', 'song.mp3', 'ENOSPC: no space left on device');
    expect(r.keepOriginalPlayable).toBe(true);
    expect(r.error).toContain('אין מספיק מקום');
    expect(failedConversion('FAILED', 'song.mp3', 'decoder error').error).toBe('הפורמט לא נתמך במכשיר הזה, או שהקובץ פגום');
  });
});
