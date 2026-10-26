import os from 'node:os';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  /** Shared secret the app sends as `Authorization: Bearer <token>`. Empty = no auth (local dev only). */
  appToken: string;
  anthropicApiKey: string;
  claudeModel: string;
  /** Key for the transcription endpoint (OpenAI, or any OpenAI-compatible Whisper server). */
  transcribeApiKey: string;
  transcribeModel: string;
  /** e.g. a self-hosted Hebrew Whisper (ivrit.ai) server exposing /v1/audio/transcriptions */
  transcribeBaseUrl: string | undefined;
  maxUploadMb: number;
  tmpDir: string;
  /** Processed files are deleted after this many minutes. */
  fileTtlMinutes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    appToken: env.APP_TOKEN ?? '',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    claudeModel: env.CLAUDE_MODEL ?? 'claude-haiku-5-5',
    transcribeApiKey: env.TRANSCRIBE_API_KEY ?? env.OPENAI_API_KEY ?? '',
    transcribeModel: env.TRANSCRIBE_MODEL ?? 'gpt-4o-transcribe',
    transcribeBaseUrl: env.TRANSCRIBE_BASE_URL || undefined,
    maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 40),
    tmpDir: env.TMP_DIR ?? path.join(os.tmpdir(), 'shiron'),
    fileTtlMinutes: Number(env.FILE_TTL_MINUTES ?? 30),
  };
}
