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

## Opening without a flicker (0.15.1)

The owner saw the home screen "flicker" as the app opened. Several things on it settled a
moment after it first showed, each moving the screen:
- **Safe-area insets.** `SafeAreaProvider` had no `initialMetrics`, so the first frame drew
  with zero insets (under the status bar) and jumped down on the next. It now starts from
  `initialWindowMetrics`.
- **The "connect an AI service" card** appeared only after the processor's first pass set
  `needsKey`, pushing the songs down. Home now decides it from `useAiConnected` (`ai === false`;
  `needsKey` still adds a key that stopped working), which is asked at launch.
- **Rows' second lines** ("ממתין לשם וקטגוריה") flipped when `useAiConnected` went from
  unknown to known.
- **Rows vs tiles** (`viewPrefs`) loaded from the database after the first frame.
- **The activity dock** flashed in for a split-second step of the queue checked at launch.
Now the splash (`ui/launch.ts`) waits for all of the first screen's needs —
`launchReady('library' | 'ai' | 'prefs')` — and then fades straight into a screen that no
longer changes (still at most `SPLASH_MAX_MS`, 2.5 s). The dock shows work she didn't start
only once it has lasted 1.5 s (`useLasting`); a share's progress still shows at once.


**Android, 0.16.2: the splash came back over the home screen.** The owner still saw a flicker
on Android. The Android check now films a cold start (`android.sh` → `shots/launch.mp4`, and
`launch-frames.png` with every frame that differs from the one before it). It showed splash →
home → splash → home. expo-splash-screen hands the splash to an exit animation
(`setOnExitAnimationListener`), and on Android 12+ the app's first frame shows before that
listener runs; the fade then put the splash back on top and faded it out. Our patch
(`patches/expo-splash-screen+58.0.13.patch`, built from source via `buildFromSource`) removes
the splash at once when the duration is 0, and `ui/launch.ts` asks for that on Android. The
iPhone keeps its 250 ms fade. The next film (15 s, with a time on each frame and the system's
log in `launch-log.txt`) went splash → home with nothing coming back. It also showed Android
flashing a scroll bar down the side of home as it opened, so home and library hide their
vertical scroll indicator.

## Long press, the action sheet, choosing several songs (0.15.0)

The owner asked for long-press menus "like a professional app" on every object, and acting on
several at once. One component and one place for what each object offers:
- **`ui/ActionSheet`** — a sheet from the bottom (thumb's reach; one host in the root layout,
  `showActions`): the thing's own tile and name at the top so she sees what she acts on, actions
  as 54 pt rows with an icon, deleting set apart in red at the end, a big "ביטול", a light
  haptic tap on opening. The action runs after the sheet has closed (an alert or a screen over
  a closing modal is dropped on iOS).
- **`ui/menus.ts`** — what each object offers; only what applies, no greyed rows:
  - a **song** (row, tile, ⋮, the mini player): נגני · פרטים ועריכה · הוספה לרשימה · שיתוף ·
    הצמדה / ביטול ההצמדה · בחירת כמה שירים (on screens that can select) · הוצאה מהרשימה (in a
    list) · מחיקת השיר. ⋮ opens the same sheet (it used to open the song's page, now one row of
    it), so a long press and ⋮ never differ.
  - a **category** tile or row: פתיחה · נגני הכול · שיתוף כל השירים · עריכה: שם, סמל וצבע ·
    הסרת הקטגוריה ("כל השירים" / "נוספו לאחרונה": no editing).
  - a **list** (library tile, home card): פתיחה · נגני את הרשימה · שיתוף הרשימה · הוספת שירים ·
    שינוי שם (opens the list with its name being edited) · מחיקת הרשימה.
  Deleting asks once, also for many ("למחוק 3 שירים?"), and says what goes with it.
- **Choosing several** (`ui/selection.tsx`) — in a category, "כל השירים" / "נוספו לאחרונה" and
  a list: "בחירה" in the header, or "בחירת כמה שירים" in a song's sheet (that song already
  checked). Rows show a check circle; a tap checks. The header says "3 נבחרו", "ביטול" takes
  back's place (Android's back button and the swipe also leave selecting first), and "בחירת
  הכול" / "ניקוי". In place of the mini player, a bar: נגני · לרשימה · שיתוף · מחיקה (in a list:
  הוצאה) — dimmed until something is checked. "לרשימה" takes all of them (`playlist/add?songs=`,
  `toggleSongs`: add the missing ones, or take them all out if all are in).
- Code: `T` moved to `ui/text.tsx`, the play helpers to `ui/play.ts`, `playlistColor` to
  `core/playlists.ts` — so the menus need no import cycle through `components`.
- e2e: `e2e-select.yaml` (a category's sheet, choosing two songs into a new list, a list's
  sheet deleting it); the flows that long-pressed a song for its page now pick "פרטים ועריכה".

## The activity dock (0.14.1)

The owner shared several songs at once and nothing said how many were waiting or done; the
old progress was a banner over the top of every screen while saving (seconds) and a line on
the home screen while one song at a time was converted or named. `ui/ActivityDock` replaces
both, at the bottom of the main screens (home, library, a category, a list) just above the mini
player — **in the layout, never over it**, so it can't hide a button, and only while there is
work. One line and a thin bar:
- saving a share: "שומרת שירים חדשים · 3 מתוך 10" (+ shares queued behind it);
- a list or category being prepared to share out: "מכינה 12 שירים לשיתוף · 5 מתוך 12";
- then every song of those shares (`ingest/batch.ts`, ids from each share or pick) on its way:
  "מכינה 10 שירים · 4 מתוך 10 מוכנים · 3 בהכנה לניגון · 3 מקבלים שם ומילים"
  (`core/progress.ts`, tested). A tap opens the list of those songs with each one's stage (a
  song opens its page). When all are ready it says "10 שירים מוכנים" in green — or how many
  failed, in red — and folds away after 6 s (✕ sooner; not while the list is open).
- work outside a share (trying failed songs again): the step, as one line.
A song is ready when it plays and has its name — or just plays, without an AI service (no name
is coming). Pending with an error (quota, offline) counts as on its way, not failed.

## Quieter rows, chosen categories first, repeat with the controls (0.14.0)

The owner asked for a professional pass over the UI. What changed, and why:
- **Rows say only what helps.** The second line drops "לא מסווג" (the grey badge already says
  it) and "ממתין לשם וקטגוריה" when no AI service is connected — nothing is on its way, and on
  every row it was noise (`useAiConnected`; the home card offers to connect). An empty second
  line is left out, so the title centres. The pin sits right after the title, in the accent
  colour, instead of floating between the text and ⋮.
- **Song screen: her categories first.** Thirty-odd chips at once buried the two that matter.
  When the song has categories, only those show, then "כל הקטגוריות" and "קטגוריה חדשה"; a song
  without any shows them all (that is when she needs to choose).
- **Full player.** Repeat moved from a labelled tile into the transport row, at the end, where
  music apps put it: an icon, accent-coloured when on, with a "1" for this song, and a toast
  that says the new mode in words (its name stays the accessibility label). The tiles below
  are now לרשימה · שיתוף · פרטים — sharing was two screens away.
- The mini player and the full player leave out "לא מסווג" too, and the home screen's lone "+" reads "+ הוספה".

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

