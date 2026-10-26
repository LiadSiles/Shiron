import Constants from 'expo-constants';
import { File, UploadType } from 'expo-file-system';
import type { ProcessResult } from '../core/types';
import { getSetting, setSetting } from '../db/repo';

export interface ServerConfig {
  url: string;
  token: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { serverUrl?: string; serverToken?: string };

export async function getServerConfig(): Promise<ServerConfig | null> {
  const url = (await getSetting('serverUrl')) ?? extra.serverUrl ?? '';
  const token = (await getSetting('serverToken')) ?? extra.serverToken ?? '';
  if (!url) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export async function saveServerConfig(cfg: ServerConfig): Promise<void> {
  await setSetting('serverUrl', cfg.url.trim());
  await setSetting('serverToken', cfg.token.trim());
}

function authHeaders(cfg: ServerConfig): Record<string, string> {
  return cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {};
}

export class ServerError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function parseResult(status: number, body: string): ProcessResult {
  if (status === 401) throw new ServerError('השרת דחה את מפתח הגישה', false);
  if (status >= 500 || status === 429) throw new ServerError(`שגיאת שרת ${status}`, true);
  if (status >= 400) {
    let msg = `שגיאה ${status}`;
    try {
      msg = JSON.parse(body).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new ServerError(msg, false);
  }
  return JSON.parse(body) as ProcessResult;
}

/** Upload an audio file; the server converts, transcribes and classifies it. */
export async function processAudio(
  cfg: ServerConfig,
  file: File,
  meta: { fileName: string; context: string | null },
): Promise<ProcessResult> {
  let res;
  try {
    res = await file.upload(`${cfg.url}/v1/process`, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'audio',
      headers: authHeaders(cfg),
      parameters: { fileName: meta.fileName, context: meta.context ?? '' },
    });
  } catch (e) {
    throw new ServerError(`אין חיבור לשרת (${String(e)})`, true);
  }
  return parseResult(res.status, res.body);
}

/** Classify a YouTube link from its title and the message it came with. */
export async function processYoutube(
  cfg: ServerConfig,
  meta: { url: string; context: string | null },
): Promise<ProcessResult & { youtubeTitle?: string }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/v1/youtube`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(cfg) },
      body: JSON.stringify(meta),
    });
  } catch (e) {
    throw new ServerError(`אין חיבור לשרת (${String(e)})`, true);
  }
  return parseResult(res.status, await res.text());
}

export async function downloadProcessedAudio(cfg: ServerConfig, audioPath: string, dest: File): Promise<File> {
  if (dest.exists) dest.delete();
  return File.downloadFileAsync(`${cfg.url}${audioPath}`, dest, { headers: authHeaders(cfg) });
}

export async function checkServer(cfg: ServerConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${cfg.url}/v1/health`, { headers: authHeaders(cfg) });
    if (res.status === 401) return { ok: false, message: 'מפתח הגישה שגוי' };
    if (!res.ok) return { ok: false, message: `השרת החזיר ${res.status}` };
    return { ok: true, message: 'מחובר' };
  } catch (e) {
    return { ok: false, message: `אין חיבור: ${String(e)}` };
  }
}
