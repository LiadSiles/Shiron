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

## UI map (0.5.0)

`src/app/_layout.tsx` (fonts, RTL, share-intent provider, toast, processing on app foreground)
→ `src/app/index.tsx` — the shell: a **search bar at the top**, the tab's content, `MiniPlayer`,
and two tabs. While she searches (field focused or text typed) `screens/SearchResults`
replaces the tab's content (recent searches, forgiving live results with highlights, category
chips, related songs by meaning when few match); "ביטול", clearing or Android back return.

- **בית** `screens/HomeScreen` — "נוספו לאחרונה" (last 2 weeks), "now" sections (holiday,
  time of day), pinned, recently played; "הכול ›" opens the full list; empty state with
  import instructions.
- **ספרייה** `screens/LibraryScreen` — square tiles in 2 columns: "כל השירים", "נוספו
  לאחרונה", then one per category → `app/category/[id]` (`all`, `recent`, or a category id;
  "נגני הכול").

There is no review tab (removed in 0.5.0) and no search tab (the bar replaced it in 0.5.0).

Stack screens: `song/[id]` (rename, categories, pin, lyrics edit, delete), `player` (modal,
full controls, scrubber, repeat, lyrics; a YouTube song shows YouTube's player here), `settings` (AI services,
file import, technical log), `connect` (modal: connect Groq), `log` (technical log: copy/clear). `+native-intent.tsx` redirects the share
extension's deep link to `/`.

Tap on a song row = play; long press = song screen (`ui/components.tsx` → `playOrOpen`).

## Code conventions (from the 0.3.3 review)

- `tsc` runs with `noUnusedLocals` / `noUnusedParameters`: dead code fails CI. Export only what
  another module imports.
- Pure logic in `src/core/` with a test in `app/tests/<module>.test.ts` (one file per module;
  `tests/fixtures.ts` has the `song()` builder).
- Fire-and-forget calls must not reject: `processQueue()` and `diag()` never throw; UI actions
  that can fail go through a helper that explains the error (`playOrOpen`, `playAll`,
  `importFromPicker`).
- Network calls to the AI services and YouTube go through `fetchWithTimeout` (src/api/http.ts).
- Anything written to disk on a path that can fail cleans up after itself (import copies,
  native `.m4a` output).
- SQL that changes more than one row set or table runs in `withTransactionAsync`.
