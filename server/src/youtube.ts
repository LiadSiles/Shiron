export interface YoutubeMeta {
  title: string;
  author: string | null;
}

export function youtubeId(url: string): string | null {
  const m =
    /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(url) ??
    /youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/|v\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

/** Title and channel via YouTube's public oEmbed endpoint — no API key, no download. */
export async function fetchYoutubeMeta(url: string, fetchImpl: typeof fetch = fetch): Promise<YoutubeMeta | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const res = await fetchImpl(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string };
  return j.title ? { title: j.title, author: j.author_name ?? null } : null;
}
