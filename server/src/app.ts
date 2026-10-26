import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import Fastify, { FastifyInstance } from 'fastify';
import { makeTranscriptionCopy, normalizeAudio, probeDuration } from './audio.js';
import type { Config } from './config.js';
import type { Transcriber } from './transcribe.js';
import { fallbackUnderstanding, type Understander } from './understand.js';
import { fetchYoutubeMeta, youtubeId, type YoutubeMeta } from './youtube.js';

export interface Deps {
  cfg: Config;
  transcriber: Transcriber;
  understander: Understander;
  youtubeMeta?: (url: string) => Promise<YoutubeMeta | null>;
}

const FILE_NAME = /^[0-9a-f-]{36}\.m4a$/;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function buildApp(deps: Deps): Promise<FastifyInstance> {
  const { cfg, transcriber, understander } = deps;
  const youtubeMeta = deps.youtubeMeta ?? ((u: string) => fetchYoutubeMeta(u));
  const filesDir = path.join(cfg.tmpDir, 'out');
  const inDir = path.join(cfg.tmpDir, 'in');
  await fsp.mkdir(filesDir, { recursive: true });
  await fsp.mkdir(inDir, { recursive: true });

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: cfg.maxUploadMb * 1024 * 1024, files: 1, fields: 10 } });

  // Every /v1 route requires the shared token when one is configured.
  app.addHook('onRequest', async (req, reply) => {
    if (!cfg.appToken || !req.url.startsWith('/v1/')) return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(token, cfg.appToken)) return reply.code(401).send({ error: 'unauthorized' });
  });

  // Processed files are picked up by the phone within seconds; drop anything stale.
  const sweep = setInterval(async () => {
    const cutoff = Date.now() - cfg.fileTtlMinutes * 60_000;
    for (const dir of [filesDir, inDir]) {
      for (const f of await fsp.readdir(dir).catch(() => [] as string[])) {
        const p = path.join(dir, f);
        const st = await fsp.stat(p).catch(() => null);
        if (st && st.mtimeMs < cutoff) await fsp.rm(p, { force: true });
      }
    }
  }, 5 * 60_000);
  sweep.unref();
  app.addHook('onClose', async () => clearInterval(sweep));

  app.get('/health', async () => ({ ok: true }));
  app.get('/v1/health', async () => ({
    ok: true,
    transcription: !!cfg.transcribeApiKey,
    ai: !!cfg.anthropicApiKey,
  }));

  app.post('/v1/process', async (req, reply) => {
    const id = crypto.randomUUID();
    const fields: Record<string, string> = {};
    let inputPath: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename || '').replace(/[^.a-z0-9]/gi, '').slice(0, 6) || '.bin';
        inputPath = path.join(inDir, `${id}${ext}`);
        await pipeline(part.file, fs.createWriteStream(inputPath));
        if (part.file.truncated) {
          await fsp.rm(inputPath, { force: true });
          return reply.code(413).send({ error: `הקובץ גדול מ-${cfg.maxUploadMb}MB` });
        }
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
    if (!inputPath) return reply.code(400).send({ error: 'לא התקבל קובץ שמע' });
    req.log.debug({ fileName: fields.fileName }, 'upload received');

    const outName = `${id}.m4a`;
    const outPath = path.join(filesDir, outName);
    const asrPath = path.join(inDir, `${id}-asr.mp3`);
    try {
      try {
        await normalizeAudio(inputPath, outPath);
      } catch (e) {
        req.log.warn({ err: e }, 'ffmpeg failed');
        return reply.code(422).send({ error: 'לא הצלחנו לקרוא את קובץ השמע' });
      }
      const durationSec = await probeDuration(outPath);
      req.log.debug({ durationSec }, 'audio normalized');

      let transcript: string | null = null;
      try {
        await makeTranscriptionCopy(outPath, asrPath);
        transcript = await transcriber.transcribe(asrPath);
      } catch (e) {
        req.log.warn({ err: e }, 'transcription failed');
      }

      req.log.debug({ hasTranscript: !!transcript }, 'transcription done');
      const input = { fileName: fields.fileName || null, context: fields.context || null, transcript };
      let u;
      try {
        u = await understander.understand(input);
      } catch (e) {
        req.log.warn({ err: e }, 'understanding failed');
        u = fallbackUnderstanding(input);
      }

      return { ...u, durationSec, audioPath: `/v1/files/${outName}` };
    } finally {
      await fsp.rm(inputPath, { force: true });
      await fsp.rm(asrPath, { force: true });
    }
  });

  app.get<{ Params: { name: string } }>('/v1/files/:name', async (req, reply) => {
    const { name } = req.params;
    if (!FILE_NAME.test(name)) return reply.code(404).send({ error: 'not found' });
    const p = path.join(filesDir, name);
    const st = await fsp.stat(p).catch(() => null);
    if (!st) return reply.code(404).send({ error: 'not found' });
    reply.header('Content-Type', 'audio/mp4').header('Content-Length', st.size);
    return reply.send(fs.createReadStream(p));
  });

  app.post<{ Body: { url?: string; context?: string | null } }>('/v1/youtube', async (req, reply) => {
    const url = req.body?.url ?? '';
    if (!youtubeId(url)) return reply.code(400).send({ error: 'זה לא נראה כמו קישור ליוטיוב' });
    const meta = await youtubeMeta(url).catch(() => null);
    const input = { fileName: null, context: req.body?.context ?? null, transcript: null, youtube: meta };
    let u;
    try {
      u = await understander.understand(input);
    } catch (e) {
      req.log.warn({ err: e }, 'understanding failed');
      u = fallbackUnderstanding(input);
    }
    return { ...u, durationSec: null, audioPath: null, youtubeTitle: meta?.title ?? null };
  });

  return app;
}
