import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createTranscriber } from './transcribe.js';
import { createUnderstander } from './understand.js';

const cfg = loadConfig();
if (!cfg.appToken) console.warn('⚠️  APP_TOKEN is not set — the server accepts requests from anyone.');
if (!cfg.anthropicApiKey) console.warn('⚠️  ANTHROPIC_API_KEY is not set — songs will not be named or categorized.');
if (!cfg.transcribeApiKey) console.warn('⚠️  TRANSCRIBE_API_KEY / OPENAI_API_KEY is not set — no lyrics.');

const app = await buildApp({ cfg, transcriber: createTranscriber(cfg), understander: createUnderstander(cfg) });
await app.listen({ port: cfg.port, host: cfg.host });
