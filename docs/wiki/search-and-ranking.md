# Search and ranking

_Last verified: 2026-10-26 (0.1.0, unit-tested in `app/tests/core.test.ts`)_

## Hebrew normalization (`core/hebrew.ts`)

- `normalize`: NFC, strip niqqud/cantillation (U+0591–U+05C7), final letters → regular
  (ך→כ …), drop geresh/gershayim and quotes (ט״ו → טו), lowercase, non-letters → space.
- `stems`: the token plus the token with one attached prefix removed (ו ה ב ל מ ש כ and
  common pairs like וה, שב, כש), keeping ≥ 2 letters.
- `skeleton`: inner ו/י removed for full vs. defective spelling (שולחן ≈ שלחן).
- `tokenMatch(query, doc)`: 3 exact stem, 2 prefix (typing; query ≥ 2 letters),
  1 skeleton match (query ≥ 3 letters).

## Search (`core/search.ts`)

- In-memory over the whole library (fine to a few thousand songs).
- Every query token must match some field (AND). Field weights: title 5, keywords 3,
  category name + hint 3, lyrics 2, summary 1.
- Phrase bonus: whole query inside title +10, inside lyrics +6.
- Tie-break by usage (`min(frecency, 5) × 0.2`).
- Snippet: first lyrics line containing a prefix-or-better match; shown unless the match was
  in the title.
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
