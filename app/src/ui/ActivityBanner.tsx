import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ImportState, onImportState } from '../ingest/ingest';
import { onProcessorState, ProcessorState } from '../ingest/processor';
import { T } from './components';
import { Icon } from './Icon';
import { cardShadow, radius, space, useTheme } from './theme';

/**
 * What the app is doing with new songs, on every screen: saving a share (with "3 מתוך 10" and
 * a bar), preparing a song to play, or getting its name and lyrics. Saving and preparing are
 * shown large — she is waiting for them; naming, which can take a while and needs nothing from
 * her, is a slim line.
 */
export function ActivityBanner() {
  const c = useTheme();
  const [imp, setImp] = useState<ImportState | null>(null);
  const [proc, setProc] = useState<ProcessorState | null>(null);
  useEffect(() => onImportState(setImp), []);
  useEffect(() => onProcessorState(setProc), []);

  if (imp?.saving) {
    const fraction = imp.total ? Math.min(1, imp.done / imp.total) : 0;
    const more = imp.queued ? ` · ועוד ${imp.queued} שיתופים בתור` : '';
    return (
      <View accessibilityLiveRegion="polite" style={[styles.big, { backgroundColor: c.primary }]}>
        <View style={styles.row}>
          <ActivityIndicator color={c.primaryInk} />
          <View style={{ flex: 1 }}>
            <T weight="bold" size={18} style={{ color: c.primaryInk }}>שומרת שירים חדשים…</T>
            <T size={14} style={{ color: c.primaryInk }}>
              {imp.total > 1 ? `${Math.min(imp.done + 1, imp.total)} מתוך ${imp.total}` : 'רגע אחד'}{more}
            </T>
          </View>
        </View>
        {imp.total > 1 ? (
          <View style={[styles.track, { backgroundColor: c.primaryInk + '44' }]}>
            <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: c.primaryInk }]} />
          </View>
        ) : null}
      </View>
    );
  }

  const step = proc?.step;
  if (step?.kind === 'convert') {
    return (
      <View accessibilityLiveRegion="polite" style={[styles.big, { backgroundColor: c.surface, borderColor: c.primary }]}>
        <View style={styles.row}>
          <Icon name="musical-notes" size={26} color={c.primary} />
          <View style={{ flex: 1 }}>
            <T weight="bold" size={17}>מכינה לניגון</T>
            <T soft size={14} numberOfLines={1}>
              {step.title}{step.left > 1 ? ` · ועוד ${step.left - 1}` : ''}
            </T>
          </View>
          <ActivityIndicator color={c.primary} />
        </View>
      </View>
    );
  }
  if (step?.kind === 'name') {
    return (
      <View style={[styles.slim, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Icon name="sparkles" size={18} color={c.accent} />
        <T size={14} numberOfLines={1} style={{ flex: 1 }}>
          נותנת שם ומילים: {step.title}{step.left > 1 ? ` · ועוד ${step.left - 1}` : ''}
        </T>
        <ActivityIndicator size="small" color={c.inkSoft} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  big: { padding: space.l, borderRadius: radius.m, borderWidth: 2, borderColor: 'transparent', gap: space.m, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', direction: 'ltr' },
  fill: { height: 6 },
  slim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.l,
    borderWidth: StyleSheet.hairlineWidth,
    ...cardShadow,
  },
});
