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
`playOrOpen`, `statusLabel`. Plus `MiniPlayer` and `ToastHost` / `toast()`.

## RTL and language

- RTL is forced natively (`expo-localization` plugin `forcesRTL: true`) and in JS on first
  Android launch (`I18nManager.forceRTL`).
- Use `start`/`end`, `marginStart`, etc. Timelines (progress bar, times) are LTR on purpose
  (`direction: 'ltr'`).
- Feminine second person in all strings ("נגני", "שמרי", "נסי").

## Not done yet

App icon and splash are Expo defaults. Swipe-to-approve on review cards (design doc) is a
button for now. No screenshot tests yet.
