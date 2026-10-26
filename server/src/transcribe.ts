import fs from 'node:fs';
import OpenAI from 'openai';
import type { Config } from './config.js';

export interface Transcriber {
  transcribe(file: string): Promise<string | null>;
}

/** Hebrew prompt nudges the model toward children's-song vocabulary and spelling. */
const PROMPT = 'שיר ילדים בעברית מגן ילדים. מילים פשוטות, חזרות, פזמון.';

export function createTranscriber(cfg: Config): Transcriber {
  if (!cfg.transcribeApiKey) {
    return { transcribe: async () => null };
  }
  const client = new OpenAI({ apiKey: cfg.transcribeApiKey, baseURL: cfg.transcribeBaseUrl });
  return {
    async transcribe(file) {
      const res = await client.audio.transcriptions.create({
        file: fs.createReadStream(file),
        model: cfg.transcribeModel,
        language: 'he',
        prompt: PROMPT,
        response_format: 'json',
      });
      const text = (res as { text?: string }).text?.trim();
      return text || null;
    },
  };
}
