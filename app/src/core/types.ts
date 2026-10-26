export type SongKind = 'audio' | 'youtube';

/**
 * pending  – saved, waiting for the processing server
 * review   – processed, but the AI was not confident; shown in the review inbox
 * ready    – in the library, confirmed or confidently auto-classified
 * failed   – processing failed; still playable when the original format allows it
 */
export type SongStatus = 'pending' | 'review' | 'ready' | 'failed';

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

/** What the processing server returns for one song. */
export interface ProcessResult {
  title: string;
  titleConfidence: number;
  categories: { id: string; confidence: number }[];
  lyrics: string | null;
  summary: string | null;
  keywords: string[];
  durationSec: number | null;
  /** Relative path on the server to download the normalized m4a, when audio was sent. */
  audioPath: string | null;
}
