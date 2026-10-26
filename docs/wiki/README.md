# Shiron wiki

Working knowledge for anyone (human or LLM) developing the app. Short, factual pages; each
one says when it was last verified. Update the page in the same commit as the change that
made it stale.

| Page | Read it when |
|---|---|
| [product.md](product.md) | You need the goal, the user, scope, and user-facing behaviour |
| [architecture.md](architecture.md) | You need the big picture: data flow, data model, statuses |
| [ingest.md](ingest.md) | Touching how songs get in: share sheet, file picker, dedupe, processing queue |
| [audio-processing.md](audio-processing.md) | The native module: decoding every format, trimming, loudness, AAC; its tests |
| [ai-pipeline.md](ai-pipeline.md) | Groq: transcription, naming/categories prompt, errors and quotas, the teacher's key |
| [search-and-ranking.md](search-and-ranking.md) | Search, Hebrew normalization, ordering inside categories, home suggestions |
| [player.md](player.md) | Playback, background audio, lock screen, play counting |
| [ios-constraints.md](ios-constraints.md) | Before any feature — what iPhone does and does not allow |
| [design.md](design.md) | Building UI: principles, theme, components, RTL rules |
| [build-and-release.md](build-and-release.md) | Building, signing, CI, releases, installing on a phone |
| [decisions.md](decisions.md) | Before proposing an alternative — it may already be rejected |
| [roadmap.md](roadmap.md) | Picking the next piece of work; current status |

The owner's Hebrew planning document (claude.ai doc "שירון הגן — תוכנית מוצר ועיצוב") is
the product-level source; this wiki is the engineering one.

## UI map (0.2.0)

`src/app/_layout.tsx` (fonts, RTL, share-intent provider, toast, processing on app foreground)
→ `src/app/index.tsx` — the shell: four tabs rendered in-place + `MiniPlayer` above the tab bar:

- **בית** `screens/HomeScreen` — "now" sections (holiday, time of day), pinned, recent;
  review banner; empty state with import instructions.
- **ספרייה** `screens/LibraryScreen` — category tiles grouped by `GROUP_NAMES` →
  `app/category/[id]` (ranked list, "נגני הכול"; `id = all` for every song).
- **חיפוש** `screens/SearchScreen` — live search, category chips, lyric snippet per hit.
- **לבדיקה** `screens/ReviewScreen` — review cards (approve, pick categories, listen) and failed items.

Stack screens: `song/[id]` (rename, categories, pin, lyrics edit, delete), `player` (modal,
full controls, lyrics), `youtube/[id]` (embedded player), `settings` (Groq status,
file import), `connect` (modal: connect Groq). `+native-intent.tsx` redirects the share
extension's deep link to `/`.

Tap on a song row = play; long press = song screen (`ui/components.tsx` → `playOrOpen`).
