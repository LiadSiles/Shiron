/** What one share or pick brought in, and the line she reads about it. */
export interface ImportSummary {
  added: string[];
  duplicates: { title: string }[];
  unsupported: string[];
  /** Songs that are fine but couldn't be saved (`noSpace`: the phone is full). */
  failed: { name: string; noSpace: boolean }[];
}

/** A file system error that means the phone's storage is full (iOS, Android and Expo wordings). */
export function isNoSpace(message: string): boolean {
  return /ENOSPC|no space|enough space|disk.*full|storage.*full|out of space|NSFileWriteOutOfSpace|code=640/i.test(message);
}

/** "שיר אחד נשמר · כבר קיים: שיר הגשם · קובץ אחד לא נתמך" — or that nothing could be saved. */
export function describeSummary(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(s.added.length === 1 ? 'שיר אחד נשמר' : `${s.added.length} שירים נשמרו`);
  if (s.duplicates.length)
    parts.push(s.duplicates.length === 1 ? `כבר קיים: ${s.duplicates[0].title}` : `${s.duplicates.length} כבר קיימים`);
  if (s.unsupported.length)
    parts.push(s.unsupported.length === 1 ? 'קובץ אחד לא נתמך' : `${s.unsupported.length} קבצים לא נתמכו`);
  // A full phone says so — "not supported" would send her looking for the wrong problem.
  const full = s.failed.filter((f) => f.noSpace).length;
  const other = s.failed.length - full;
  if (full) parts.push(full === 1 ? 'שיר אחד לא נשמר: אין מספיק מקום בטלפון' : `${full} שירים לא נשמרו: אין מספיק מקום בטלפון`);
  if (other) parts.push(other === 1 ? 'שיר אחד לא נשמר, נסי לשתף אותו שוב' : `${other} שירים לא נשמרו, נסי לשתף אותם שוב`);
  return parts.join(' · ') || 'לא נמצא שיר לשמירה';
}
