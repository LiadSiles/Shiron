import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { probeDuration } from '../src/audio.js';
import { loadConfig } from '../src/config.js';
import { buildUserMessage, createUnderstander, sanitize, type SongInput } from '../src/understand.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shiron-test-'));
const cfg = { ...loadConfig({}), appToken: 'secret', tmpDir: path.join(tmp, 'work') };

/** A WhatsApp-like voice note: Ogg/Opus, 1.5s silence, 3s tone, 1s silence, quiet. */
const voiceNote = path.join(tmp, 'PTT-20251012-WA0014.opus');
beforeAll(() => {
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=1.5',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=1',
    '-filter_complex', '[1]volume=0.05[t];[0][t][2]concat=n=3:v=0:a=1',
    '-c:a', 'libopus', '-b:a', '24k', voiceNote,
  ]);
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const seen: SongInput[] = [];
const fakeUnderstander = {
  async understand(input: SongInput) {
    seen.push(input);
    return {
      title: 'נר לי דקיק', titleConfidence: 0.95,
      categories: [{ id: 'hanukkah', confidence: 0.97 }],
      lyrics: 'נר לי דקיק\nנר לי דק', summary: 'שיר חנוכה', keywords: ['נרות', 'חנוכייה'],
    };
  },
};

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer }) {
  const boundary = '----shiron' + Date.now();
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${file.name}"\r\nContent-Type: audio/ogg\r\n\r\n`));
  chunks.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('server', () => {
  it('rejects requests without the token', async () => {
    const app = await buildApp({ cfg, transcriber: { transcribe: async () => null }, understander: fakeUnderstander });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('converts a WhatsApp opus note to a trimmed, normalized m4a and classifies it', async () => {
    const app = await buildApp({
      cfg,
      transcriber: { transcribe: async () => 'נר לי דקיק נר לי דק' },
      understander: fakeUnderstander,
    });
    const mp = multipart(
      { fileName: 'PTT-20251012-WA0014.opus', context: 'מצרפת שיר לחנוכה 🕎' },
      { name: 'PTT-20251012-WA0014.opus', data: fs.readFileSync(voiceNote) },
    );
    const res = await app.inject({
      method: 'POST', url: '/v1/process', payload: mp.body,
      headers: { 'content-type': mp.contentType, authorization: 'Bearer secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('נר לי דקיק');
    expect(body.categories[0].id).toBe('hanukkah');
    expect(body.audioPath).toMatch(/^\/v1\/files\/[0-9a-f-]{36}\.m4a$/);
    // Silence at both ends was trimmed: ~3s of tone out of 5.5s.
    expect(body.durationSec).toBeGreaterThan(2.5);
    expect(body.durationSec).toBeLessThan(4);
    // The context message reached the AI.
    expect(seen.at(-1)?.context).toContain('חנוכה');

    const file = await app.inject({ method: 'GET', url: body.audioPath, headers: { authorization: 'Bearer secret' } });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/mp4');
    const out = path.join(tmp, 'out.m4a');
    fs.writeFileSync(out, file.rawPayload);
    const codec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out]).toString().trim();
    expect(codec).toBe('aac');
    // Loudness raised from a very quiet recording toward -16 LUFS.
    const meanDb = (f: string) => {
      const r = spawnSync('ffmpeg', ['-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
      return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1]);
    };
    expect(meanDb(out)).toBeGreaterThan(meanDb(voiceNote) + 6);
    expect(await probeDuration(out)).toBeGreaterThan(2.5);
    await app.close();
  }, 30000);

  it('rejects path traversal on the files route', async () => {
    const app = await buildApp({ cfg, transcriber: { transcribe: async () => null }, understander: fakeUnderstander });
    const res = await app.inject({ method: 'GET', url: '/v1/files/..%2F..%2Fetc%2Fpasswd', headers: { authorization: 'Bearer secret' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 422 for a file that is not audio', async () => {
    const app = await buildApp({ cfg, transcriber: { transcribe: async () => null }, understander: fakeUnderstander });
    const mp = multipart({ fileName: 'x.mp3' }, { name: 'x.mp3', data: Buffer.from('not audio at all') });
    const res = await app.inject({
      method: 'POST', url: '/v1/process', payload: mp.body,
      headers: { 'content-type': mp.contentType, authorization: 'Bearer secret' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('classifies a YouTube link from its title', async () => {
    const app = await buildApp({
      cfg, transcriber: { transcribe: async () => null }, understander: fakeUnderstander,
      youtubeMeta: async () => ({ title: 'נר לי דקיק - שירי חנוכה לילדים', author: 'ערוץ הופ' }),
    });
    const res = await app.inject({
      method: 'POST', url: '/v1/youtube', headers: { authorization: 'Bearer secret' },
      payload: { url: 'https://youtu.be/dQw4w9WgXcQ', context: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().audioPath).toBeNull();
    expect(seen.at(-1)?.youtube?.title).toContain('חנוכה');
    await app.close();
  });
});

describe('understanding', () => {
  it('drops invented categories and clamps confidence', () => {
    const u = sanitize({
      title: '"שיר הבוקר"', title_confidence: 1.4,
      categories: [{ id: 'morning', confidence: 0.9 }, { id: 'made-up', confidence: 0.8 }, { id: 'morning', confidence: 0.5 }],
      lyrics: '  ', summary: null, keywords: ['בוקר', 'בוקר', ' שמש '],
    });
    expect(u.title).toBe('שיר הבוקר');
    expect(u.titleConfidence).toBe(1);
    expect(u.categories).toEqual([{ id: 'morning', confidence: 0.9 }]);
    expect(u.lyrics).toBeNull();
    expect(u.keywords).toEqual(['בוקר', 'שמש']);
  });

  it('falls back to "unsorted" when nothing valid is returned', () => {
    const u = sanitize({ title: '', title_confidence: 0.1, categories: [], lyrics: null, summary: null, keywords: [] });
    expect(u.categories[0].id).toBe('unsorted');
  });

  it('puts the category list, context and transcript in the prompt', () => {
    const msg = buildUserMessage({ fileName: 'a.opus', context: 'לט״ו בשבט', transcript: 'השקדייה פורחת' });
    expect(msg).toContain('tu-bishvat');
    expect(msg).toContain('לט״ו בשבט');
    expect(msg).toContain('השקדייה פורחת');
  });

  it('sends a structured-output request to Claude and sanitizes the reply', async () => {
    let params: Record<string, unknown> = {};
    const client = {
      messages: {
        parse: async (p: Record<string, unknown>) => {
          params = p;
          return { parsed_output: { title: 'יום הולדת שמח', title_confidence: 0.9, categories: [{ id: 'birthday', confidence: 0.95 }], lyrics: null, summary: 'שיר יום הולדת', keywords: ['עוגה'] } };
        },
      },
    };
    const u = await createUnderstander({ ...cfg, anthropicApiKey: '' }, client as never).understand({ fileName: null, context: null, transcript: 'היום יום הולדת' });
    expect(u.categories[0].id).toBe('birthday');
    expect(params.model).toBe('claude-haiku-5-5');
    expect((params.output_config as { format: { type: string } }).format.type).toBe('json_schema');
  });
});
