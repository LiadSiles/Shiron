import { Platform } from 'react-native';
import { getSetting, setSetting } from '../db/repo';

/**
 * A short technical log of what happened to recent songs (import, conversion, AI, playback),
 * shown in Settings → יומן טכני with a copy button. It is how device-only problems get
 * diagnosed: the owner copies it into a message. Kept on the phone only; last 150 lines.
 */

const KEY = 'diagLog';
const MAX = 150;
let lines: string[] | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

type Listener = (lines: string[]) => void;
const listeners = new Set<Listener>();

async function load(): Promise<string[]> {
  if (lines) return lines;
  try {
    lines = JSON.parse((await getSetting(KEY)) ?? '[]');
  } catch {
    lines = [];
  }
  return lines!;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function describe(v: unknown): string {
  if (v instanceof Error) {
    const code = (v as { code?: string }).code;
    return `${code ? `${code}: ` : ''}${v.message}`;
  }
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Adds one line: "time event · detail · detail". Never throws. */
export function diag(event: string, ...details: unknown[]): void {
  const line = [`${stamp()} ${event}`, ...details.map(describe)].join(' · ');
  // Also to the system log on Android, so CI's emulator run can read it next to the player's own
  // lines (adb logcat). Stays on the phone like the rest of the log.
  if (__DEV__ || Platform.OS === 'android') console.log('[diag]', line);
  void load().then((l) => {
    l.push(line);
    if (l.length > MAX) l.splice(0, l.length - MAX);
    listeners.forEach((fn) => fn([...l]));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      setSetting(KEY, JSON.stringify(l)).catch(() => undefined);
    }, 500);
  });
}

export async function readDiag(): Promise<string[]> {
  return [...(await load())];
}

export async function clearDiag(): Promise<void> {
  lines = [];
  listeners.forEach((fn) => fn([]));
  await setSetting(KEY, '[]');
}

export function onDiag(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
