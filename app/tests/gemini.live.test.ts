/**
 * Live check against Gemini with a real key: the same request the app sends (core/geminiRules)
 * with a Hebrew recording. Skipped unless GEMINI_API_KEY and LIVE_AUDIO (an .m4a) are set —
 * CI sets them on macOS from the repository secret, with speech made by `say -v Carmit`
 * (.github/workflows/ios-sim.yml). The key never leaves the secret.
 */
import { describe, expect, it } from 'vitest';
import { errorFromGemini, GEMINI_API, GEMINI_MODELS, geminiNamingRequest, geminiStopReason, geminiText } from '../src/core/geminiRules';
import { parseModelJson, sanitize } from '../src/core/understand';

const key = process.env.GEMINI_API_KEY;
const audio = process.env.LIVE_AUDIO;

describe.skipIf(!key || !audio)('Gemini, live', () => {
  it('names a Hebrew recording and writes out its words', async () => {
    const fsModule = 'node:fs'; // the app's tsconfig has no Node types
    const { readFileSync } = await import(fsModule);
    const sound = { inline_data: { mime_type: 'audio/m4a', data: readFileSync(audio!).toString('base64') } };
    const body = geminiNamingRequest({ fileName: 'PTT-20261106-WA0001.m4a', context: null, transcript: null, youtube: null }, sound);
    const tried: string[] = [];
    for (const model of GEMINI_MODELS) {
      const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        const err = errorFromGemini(res.status, text);
        tried.push(`${model}: ${err.kind} ${err.message.slice(0, 120)}`);
        if (err.kind === 'rate-limited' || err.kind === 'unavailable') continue;
        throw new Error(tried.join('\n'));
      }
      const json = JSON.parse(text);
      const answer = geminiText(json);
      console.log(`${model}: ${geminiStopReason(json) ?? 'STOP'}\n${answer}`);
      const u = sanitize(parseModelJson(answer));
      expect(u.lyrics, 'lyrics').toMatch(/גן|ילדים|שיר/);
      return;
    }
    throw new Error(`no model answered:\n${tried.join('\n')}`);
  }, 240_000);
});
