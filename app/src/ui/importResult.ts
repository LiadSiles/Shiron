import { Alert } from 'react-native';
import { describeSummary, formatWarning, importFromPicker, ImportSummary } from '../ingest/ingest';
import { toast } from './toast';

/** What was saved, as a toast; formats no phone can read get an explanation she must see. */
export function showImportResult(s: ImportSummary) {
  toast(describeSummary(s), s.added.length ? 'success' : 'info');
  const warning = formatWarning(s);
  if (warning) Alert.alert('הקובץ לא נתמך', warning);
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
