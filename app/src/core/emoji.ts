/**
 * Picking a category's emoji from the phone's own emoji keyboard (owner, 0.14.0): whatever she
 * types, the last emoji in it is the one. Pure logic, unit-tested.
 *
 * Written with code-point ranges rather than `\p{Extended_Pictographic}`: the app already
 * relies on `\p{L}` on the phones, but not yet on binary emoji properties in Hermes, and the
 * ranges are easy to check. An emoji here is a pictograph (or a
 * keycap, or a flag of two regional letters) with what may follow it: a skin tone, the emoji
 * presentation selector, tag characters (subdivision flags), and more pictographs joined by
 * zero-width joiners (families, professions).
 */
const PICTO = '[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}\\u{2190}-\\u{21FF}\\u{2934}\\u{2935}\\u{25A0}-\\u{25FF}\\u{3030}\\u{303D}\\u{3297}\\u{3299}\\u{00A9}\\u{00AE}\\u{2122}\\u{2139}\\u{203C}\\u{2049}]';
const MODS = '(?:\\u{FE0F}|[\\u{1F3FB}-\\u{1F3FF}]|[\\u{E0020}-\\u{E007F}])*';
const EMOJI = new RegExp(
  `[\\u{1F1E6}-\\u{1F1FF}]{2}|[#*0-9]\\u{FE0F}?\\u{20E3}|${PICTO}${MODS}(?:\\u{200D}${PICTO}${MODS})*`,
  'gu',
);

/** The last emoji in `text`, whole (with its skin tone, joined parts…); null if there is none. */
export function lastEmoji(text: string): string | null {
  const all = text.match(EMOJI);
  return all?.length ? all[all.length - 1] : null;
}
