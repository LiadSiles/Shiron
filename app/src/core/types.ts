export type SongKind = 'audio' | 'youtube';

/**
 * State of the on-device audio step (decode → trim → loudness → AAC .m4a).
 * raw          – as shared; playable only if the platform reads the original format
 * done         – converted; playableUri points at the .m4a
 * unsupported  – this phone can't decode the format (e.g. webm on iPhone)
 */
export type AudioState = 'raw' | 'done' | 'unsupported';

/**
 * AI step (Groq or Gemini: transcription + title/categories):
 * pending  – saved, waiting for the AI (or for the teacher to connect a service)
 * review   – processed, but the AI was not confident; shown in the review inbox
 * ready    – in the library, confirmed or confidently auto-classified
 * When the AI can't handle a song, it goes to review with a fallback name and `error` set
 * (0.1's server-side 'failed' status was migrated away in DB v3).
 */
export type SongStatus = 'pending' | 'review' | 'ready';

export type TitleSource = 'file' | 'ai' | 'user';

export interface Song {
  id: string;
  kind: SongKind;
  title: string;
  titleSource: TitleSource;
  lyrics: string | null;
  summary: string | null;
  keywords: string[];
  originalUri: string | null;
  playableUri: string | null;
  youtubeId: string | null;
  sourceName: string | null;
  contextText: string | null;
  sha256: string | null;
  durationSec: number | null;
  audioState: AudioState;
  status: SongStatus;
  error: string | null;
  pinnedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SongCategory {
  songId: string;
  categoryId: string;
  confidence: number;
  confirmed: boolean;
}

export interface PlayEvent {
  songId: string;
  startedAt: number;
  listenedSec: number;
}

export interface SongWithCategories extends Song {
  categories: SongCategory[];
}
