# Design

_Last verified: 2026-10-26 (0.1.0)_

## Principles (from the planning doc — they decide every UI question)

1. **Playing comes first.** Count taps to playback; target 2 from home for a common song.
2. **The AI suggests, the teacher decides.** One tap to change any name or category.
3. **Zero maintenance.** An unsorted library still works (home suggestions, search, recents).
4. **One hand, at a distance.** Touch ≥ 48 pt (`TOUCH`), full-player stop button 88 pt,
   high contrast, common actions in thumb reach.
5. **Quiet in front of children.** No pop-up dialogs during playback (use `toast()`), fade on
   stop, no system sounds.

## Tokens (`src/ui/theme.ts`)

- Palette light/dark (`useTheme()`, follows the system; dark for nap time). Primary coral
  `#D9573B` / `#F07A5E`. Warm off-white background.
- Font: Rubik (400/500/700, `@expo-google-fonts/rubik`), loaded in `_layout.tsx` before render.
- Spacing `space.{xs..xxl}` (4–32), radii `radius.{s,m,l}` (10/16/24).
- Category identity = emoji + color from `categories.ts`; `CategoryBadge` tints the color at
  ~18% alpha. The same badge is the song's "artwork" everywhere.

## Components (`src/ui/components.tsx`)

`T` (text with weight/size/soft), `Button` (primary/quiet), `CategoryBadge`, `SongRow`
(tap plays, long press opens; shows status line), `EmptyState`, `SectionTitle`,
`playOrOpen`, `statusLabel`, `Highlighted` (search hits in bold). Plus `MiniPlayer`,
`Scrubber`, the drawn media icons (`icons.tsx`) and `StatusHost` / `toast()`.

**Icons (0.6.0):** UI symbols are Ionicons through `ui/Icon.tsx` (`@expo/vector-icons`, bundled
font, no network): tab bar (outline when inactive, filled when active), search field, buttons
(`Button icon=`), empty states (`EmptyState icon=` in a soft circle), repeat, YouTube offline.
Emoji stay only where they are content: category icons and the big art on library tiles.
The play/pause/next/previous glyphs stay drawn (`icons.tsx`) so they match exactly at every size.

## Sorting, rows or tiles, her categories (0.10.0)

`ui/ViewControls.tsx`: sort chips that scroll sideways and a rows/tiles switch (48 pt), above
the library's categories, a category's songs and a playlist. Choices are remembered
(`ui/viewPrefs.ts`). Tiles for songs: `SongTile` (category colour, emoji, title; tap = play,
long press / ⋮ = details). Rows for categories: badge, name, count. Category editor
(`app/category/edit.tsx`, modal): name, emoji grid — first a dashed "+" field for any emoji
from the phone's keyboard (0.14.0, `core/emoji.ts → lastEmoji`; her own emoji then leads the
grid, selected) —, 12 colours, live preview, remove; opened from
a category's ✎, the library's "קטגוריה חדשה", and a song's "קטגוריה חדשה" chip.

## Library (`src/screens/LibraryScreen.tsx`, 0.3.1; playlists 0.7.0)

"הרשימות שלי" comes first: one tile per playlist (colour from its id, `ui/playlists.tsx →
playlistColor`, a palette separate from the categories) and a dashed "רשימה חדשה" tile. Then
"קטגוריות". Tiles take an Ionicon (`icon`) or a category emoji (`emoji`) as the corner art.

Two columns of square tiles, Spotify "browse" style: the category colour fills the tile, the
name in bold at the top start, the song count under it, and the category emoji large, tilted
and cut off at the bottom end. Text colour is chosen per tile for contrast (`core/color.ts →
textOn`). "כל השירים" is the first tile. One level only — no group headings (decisions.md).

## Playlists (0.7.0, `app/playlist/`, `ui/playlists.tsx`, `core/playlists.ts`)

- `playlist/[id]` — coloured header card (tap the name to rename inline), "נגני הכול",
  "הוספת שירים", the songs as normal `SongRow`s (tap plays from there, the list is the queue).
  Header "סידור" → rows with ▲ ▼ ✕ (48 pt each); "מחיקת הרשימה" at the bottom with a confirm.
- `playlist/pick` (modal) — new list (name field + songs) or adding to one (`id` param): the
  library most-used first, a search field (`searchSongs`), tap toggles; the check circle shows
  the song's position in the list. Saved with one button.
- `playlist/add?song=` (modal, from the song screen) — her lists with a check each, toggled
  immediately; or a new list starting with this song.
- Home: `PlaylistStrip` — a row of 150 pt cards; the round button plays/pauses the whole list.

## RTL and language

- RTL is forced natively (`expo-localization` plugin `forcesRTL: true`) and in JS on first
  Android launch (`I18nManager.forceRTL`).
- Use `start`/`end`, `marginStart`, etc. Timelines (progress bar, times) are LTR on purpose
  (`direction: 'ltr'`).
- Feminine second person in all strings ("נגני", "שמרי", "נסי").

## Diagnostics (0.3.0)

Device-only problems are diagnosed from the phone, not from logs we can't reach:
- `src/diag/log.ts` → `diag(event, …details)`: a 150-line ring buffer in `settings.diagLog`,
  shown in Settings → יומן טכני (newest first, copy button with app version and OS). Logged:
  share received (type, file names, MIME, paths), import (size), converted (duration, gain,
  size, ms) / convert failed (code, message), transcribed, named, groq failed, play (file, size),
  play failed (the player's `status.error`), browser fallbacks.
- Song screen → "פרטים טכניים" (collapsed): audio/AI state, error, both files with existence
  and size, duration, shared file name, id.
- The mini player shows the platform player's error in red instead of silently not playing.

When the owner reports a problem, ask for the copied log or a screenshot of the song's
technical details first.

## Not done yet

App icon and splash are Expo defaults. (Swipe-to-approve went with the review inbox in 0.5.0.) The rest is a
button for now. No screenshot tests yet.

## Status banner and toasts (0.6.0, `ui/toast.tsx → StatusHost`, `ui/ActivityBanner.tsx`)

Owner: the "שומרת…" toast was too small and easy to miss. `StatusHost` sits in the root layout
(above the navigator, so on every screen; below native iOS modals such as the full player) and
stacks, at the top:

- **ActivityBanner** — from `onImportState` (ingest) and `ProcessorState.step`:
  saving a share = large primary-colour card, "שומרת שירים חדשים…", "3 מתוך 10", progress
  bar, "ועוד n שיתופים בתור"; preparing to play = large card with the song's title;
  naming (can take long, needs nothing from her) = a slim line.
- **Toast** — `toast(text, kind)`; kind `success` / `info` / `error` sets the icon and border
  colour; 17 pt bold, 3.5 s, `accessibilityLiveRegion` for screen readers.

## Launch and app icon (0.8.0)

- No white frame at launch: `expo-splash-screen` (app.json) draws the app's cream (`#FBF7F1`, dark
  `#16151A`) with the coral notes logo; `ui/launch.ts` keeps it up (`preventAutoHideAsync` at
  module scope) until the shell has fonts and the library loaded (`appReady()` from
  `app/index.tsx`), then fades in 250 ms. A 2.5 s cap in `_layout.tsx` means she never waits on
  it. `expo-system-ui` sets the window background to `c.bg` (light/dark), so transitions never
  show white either. The Android 12+ system splash is drawn natively, so check it on a release build.
- The icon set (icon, adaptive foreground/background/monochrome, splash logo, favicon) is drawn
  as SVG by `app/assets/source/make-icons.py` (Playwright renders it). Since 0.9.0 (PlayGan): a
  play arrow of six rainbow xylophone bars with white nails, on cream `#FFF8EC`, three small
  notes above its upper edge — the owner approved this exact layout after several rounds
  (arrow big and centred; only three small notes, close but not touching). 0.9.1: the arrow a
  little smaller (600 × 640 of 1024) and optically centred — the drawn arrow, not its box, sits
  in the middle — and the notes a little bigger; notes are placed along the upper edge so they
  follow the arrow if it is resized. Adaptive layers draw
  it at 72 % so Android's mask doesn't cut it. Change the drawing there and re-run; don't
  hand-edit the PNGs.

## Organisation patterns (0.8.0)

- **`ui/list.tsx`**: `ListGroup` + `ListItem` — the phone-settings pattern (small heading, rows
  in one rounded card, coloured icon tile, title, explanation, value, chevron; `danger` rows in
  red). Settings and the song screen's secondary actions use it. `ActionBar` — 2–3 equal big
  tiles (icon over a word) for a screen's main actions: song screen (ניגון · הצמדה · לרשימה),
  full player (חזרה · לרשימה · פרטים). New screens should reuse these, not invent buttons.
- **Song rows**: tap = play/pause; a visible ⋮ opens the song (long-press still works). The song
  playing shows a pause button in the coral circle where its category badge was.
- **Settings** live next to the search bar on every tab (not in the home header).
- **Tile text**: `core/color.textOn` prefers white whenever it reaches 3:1 (WCAG AA for large
  text), so coral/purple tiles match the buttons; dark text only on light colours.
- Review real screens with the emulator walk (`build-and-release.md` → screenshots).

