import { fetchWithTimeout } from './http';

/** Title and channel through YouTube's public oEmbed endpoint: no key, no download. */
export async function youtubeMeta(youtubeId: string): Promise<{ title: string; author: string | null } | null> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
    const res = await fetchWithTimeout(url, {}, 15_000, null);
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return j.title ? { title: j.title, author: j.author_name ?? null } : null;
  } catch {
    return null;
  }
}
