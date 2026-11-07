/**
 * What VoiceOver / TalkBack reads for a settings-style row: the title, then its value ("מחובר ✓",
 * "הקלטות וקישורים"), then the explanation. A Pressable with a label hides its children's
 * text, so a value left out of the label was never read aloud (nor found by the UI tests).
 */
export function rowLabel(title: string, value?: string | null, subtitle?: string | null): string {
  return [title, value, subtitle].map((p) => p?.trim()).filter(Boolean).join('. ');
}
