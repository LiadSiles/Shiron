# Search and ranking

_Last verified: 2026-10-26 (0.3.0, unit-tested in `app/tests/search.test.ts`, `hebrew.test.ts`, `ranking.test.ts`)_

## Hebrew normalization (`core/hebrew.ts`)

- `normalize`: NFC, strip niqqud/cantillation (U+0591–U+05C7), final letters → regular
  (ך→כ …), drop geresh/gershayim and quotes (ט״ו → טו), lowercase, non-letters → space.
- `stems`: the token plus the token with one attached prefix removed (ו ה ב ל מ ש כ and
  common pairs like וה, שב, כש), keeping ≥ 2 letters.
- `skeleton`: inner ו/י removed for full vs. defective spelling (שולחן ≈ שלחן).
- `phonetic`: skeleton with letters that sound alike (and that a teacher typing fast swaps)
  folded together: ט→ת, ח→כ, ק→כ, ש→ס, ע→א.
- `editDistance`: Damerau–Levenshtein (a swap of two adjacent letters = 1), with early exit.
  Allowed typos: 0 for words < 4 letters, 1 for 4–7, 2 for 8+.
- `tokenMatch(query, doc)` → `MATCH` scale: exact stem 3, prefix while typing 2 (query ≥ 2),
  spelling (skeleton) 1.5, sound-alike (phonetic) 1.2, typo 0.8, typo in a prefix 0.6.
  Doc stems are tried against the query as typed; the query's own prefix-stripped forms
  ("בגשם" → "גשם") count only as **whole-word** matches (×0.9) — as prefixes they made "שמש"
  match everything starting with "מש".

## Search (`core/search.ts`)

- In-memory over the whole library (fine to a few thousand songs).
- Every query token must match some field (AND). Field weights: title 5, keywords 3,
  category name + hint 3, lyrics 2, WhatsApp message it came with (`contextText`) 1.5,
  summary 1, file name 1 (extension dropped, `_`/`-` → space). Indexes are cached per song
  object (`WeakMap`), so a library reload rebuilds them.
- Phrase bonus: whole query inside title +10, inside lyrics +6.
- Tie-break by usage (`min(frecency, 5) × 0.2`).
- Snippet: the lyrics line with the highest summed match; if there are no lyrics and the
  match was in the WhatsApp message, its first line. Shown unless the match was in the title.
- `highlight(text, query)` splits into segments marking words with a match ≥ typo; the title
  and snippet render them bold in the accent colour (`Highlighted` in `ui/components.tsx`).
- Recent searches: last 8 (`pushRecent`, setting `recentSearches`), saved on submit, on
  touching a result, on scrolling results, or on opening a category chip — not on every
  keystroke.

## Search by meaning (Groq)

- When the typed words find fewer than 3 songs, after 700 ms without typing, the search
  screen asks Groq for up to 12 related Hebrew words (`expandQuery`, `EXPAND_PROMPT`,
  `parseExpansion`). Smaller chat model (`CHAT_MODELS` last), `json_object`, cached per query
  for the session, aborted when she keeps typing.
- **Only the query text is sent**, never the library — same service and key as processing,
  so no new privacy decision.
- Related words are OR'd: a song qualifies if one of them matches at ≥ 2.25 weighted
  (spelling in a title-weighted field, or exact in lyrics, etc.), scored ×0.4, marked
  `related`, listed after direct hits under "שירים בנושא דומה". Without a key or on error
  (logged to the technical log) nothing changes.
- `matchCategories(query)`: typed category names ("חנוכה", "מנוחה") show category chips above
  results.
- Songs in `review` are excluded from search and the library until approved.

## Ranking inside a category (`core/ranking.ts`)

```
score = Σ over real plays e^(−age_days / 30) + new-song boost + seasonal boost
```

- A play counts if ≥ 20 s listened, or ≥ 60% of a short song.
- New-song boost: 1.5 fading linearly to 0 over 7 days (new songs aren't buried).
- Seasonal boost: +3 while the song's category is in season.
- Pinned songs first (latest pin on top), then score, then Hebrew alphabetical.
- Plays from the last 365 days are loaded (`repo.playsBySong`).
- The list must not reshuffle while she scrolls: ranking is computed on load/change, not on
  a timer.

## Seasons and time of day (`core/categories.ts`)

- Hebrew date via `Intl.DateTimeFormat('en-u-ca-hebrew')`; month names normalized
  (`Adar II`/`Adar` → `adar`, `Adar I` → `adar1`, Tishrei/Cheshvan spellings). If the
  platform lacks the Hebrew calendar, seasons are simply off.
- Windows are inclusive and may wrap the new year (Elul → Tishri). Ordering assumes
  `adar1` before `adar`.
- Shabbat songs are suggested Thursday afternoon and Friday.
- `hours: [start, end)` on routine categories drive "עכשיו: …" sections on the home screen.
- Whether Hermes' `Intl` supports the Hebrew calendar on a real device is **not verified
  yet** (tests run on Node's ICU). Check the home screen during a holiday window; if it
  fails, `toHebrewDate()` returns null and seasons are silently off — replace it with a
  small Hebrew-calendar library then.
