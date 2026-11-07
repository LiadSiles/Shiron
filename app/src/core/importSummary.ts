/** What one share or pick brought in, and the line she reads about it. */
export interface ImportSummary {
  added: string[];
  duplicates: { title: string }[];
  unsupported: string[];
}

/** "שיר אחד נשמר · כבר קיים: שיר הגשם · קובץ אחד לא נתמך" — or that nothing could be saved. */
export function describeSummary(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(s.added.length === 1 ? 'שיר אחד נשמר' : `${s.added.length} שירים נשמרו`);
  if (s.duplicates.length)
    parts.push(s.duplicates.length === 1 ? `כבר קיים: ${s.duplicates[0].title}` : `${s.duplicates.length} כבר קיימים`);
  if (s.unsupported.length)
    parts.push(s.unsupported.length === 1 ? 'קובץ אחד לא נתמך' : `${s.unsupported.length} קבצים לא נתמכו`);
  return parts.join(' · ') || 'לא נמצא שיר לשמירה';
}
