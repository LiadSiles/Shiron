import { describeSummary, importFromPicker, ImportSummary } from '../ingest/ingest';
import { toast } from './toast';

/** What was saved, as a toast. */
export function showImportResult(s: ImportSummary) {
  toast(describeSummary(s), s.added.length ? 'success' : 'info');
}

/** The "add from Files" buttons (home screen, settings). */
export async function pickAndImport() {
  try {
    const summary = await importFromPicker();
    if (summary) showImportResult(summary);
  } catch {
    toast('לא הצלחנו לפתוח את הקבצים', 'error');
  }
}
