import { requireNativeModule } from 'expo';

export interface ProcessedAudio {
  /** Length of the output after trimming silence. */
  durationSec: number;
  sourceDurationSec: number;
  /** Gain applied to reach the target loudness (negative = turned down). */
  gainDb: number;
  trimStartSec: number;
  trimEndSec: number;
}

/** Error codes thrown by `processAudio` (prefixed `ERR_AUDIO_`). */
export type AudioErrorCode = 'UNSUPPORTED' | 'NO_AUDIO' | 'TOO_LONG' | 'CORRUPT' | 'FAILED' | 'BAD_URI';

interface NativeModule {
  processAsync(inputUri: string, outputUri: string): Promise<ProcessedAudio>;
  splitAsync(inputUri: string, outputDirUri: string, chunkSec: number): Promise<string[]>;
  startBackgroundWork(text: string): void;
  stopBackgroundWork(): void;
  appGroupStatus?(): AppGroupStatus;
  shareFilesAsync(uris: string[], mimeType: string, text: string | null, title: string): Promise<void>;
}

const native = requireNativeModule<NativeModule>('ShironAudio');

/**
 * Decodes any supported recording (WhatsApp Opus, mp3, m4a, wav, flac, amr, video…), trims
 * silence at both ends, normalises loudness and writes mono AAC .m4a at 44.1 kHz.
 * Both URIs must be file:// URIs. Runs on a native background thread.
 */
export function processAudio(inputUri: string, outputUri: string): Promise<ProcessedAudio> {
  return native.processAsync(inputUri, outputUri);
}

/**
 * Consecutive parts (file:// URIs, .m4a, `part-0.m4a`…) of a converted song, cut without
 * re-encoding, for transcribing part by part. The last part takes a short tail.
 */
export function splitAudio(inputUri: string, outputDirUri: string, chunkSec: number): Promise<string[]> {
  return native.splitAsync(inputUri, outputDirUri, chunkSec);
}

/**
 * Keep the app working after she leaves it: an Android foreground service with a quiet
 * notification, or iOS's ~30 s of extra background time. Call stop when the work is done.
 */
export function startBackgroundWork(text: string): void {
  native.startBackgroundWork(text);
}

export function stopBackgroundWork(): void {
  native.stopBackgroundWork();
}

/** iOS: the share extension's App Group on this install (see the Swift module). */
export interface AppGroupStatus {
  declared?: string;
  /** The group this signature grants; missing = the extension can pass links but not files. */
  granted?: string;
  alt: string[];
  provisioned: string[];
}

/** iOS only (null elsewhere): whether files can be shared into the app on this install. */
export function appGroupStatus(): AppGroupStatus | null {
  return native.appGroupStatus?.() ?? null;
}

export function audioErrorCode(e: unknown): AudioErrorCode | null {
  const code = (e as { code?: string } | null)?.code;
  return typeof code === 'string' && code.startsWith('ERR_AUDIO_') ? (code.slice(10) as AudioErrorCode) : null;
}

/**
 * Songs (file:// URIs under cache/share/) and/or text (YouTube links) to the system share sheet
 * — WhatsApp and the rest. `mimeType` covers all the files. Resolves once the sheet is up.
 */
export function shareFiles(uris: string[], mimeType: string, text: string | null, title: string): Promise<void> {
  return native.shareFilesAsync(uris, mimeType, text, title);
}
