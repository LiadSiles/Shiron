import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { importStore } from '../ingest/ingest';
import { processorStore } from '../ingest/processor';
import { T } from './components';
import { Icon } from './Icon';
import { cardShadow, radius, space, useTheme } from './theme';
import { useStore } from './useStore';

/**
 * Saving a share ("3 מתוך 10" and a bar), floating below the header on every screen: she just
 * shared and waits for it, and it lasts seconds. Everything slower is `WorkStatus`.
 */
export function SavingBanner() {
  const c = useTheme();
  const imp = useStore(importStore);

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
  return null;
}

/**
 * Work on songs that goes on in the background — preparing a song to play, giving it a name
 * and lyrics (minutes, for a long song). A line in the home screen's content, not a layer over
 * every screen: as a floating banner it hid the top of each screen and the back button for as
 * long as a transcription ran (owner, 0.11). Each song's row also says it ("מכינה לניגון…").
 */
export function WorkStatus() {
  const c = useTheme();
  const proc = useStore(processorStore);
  const step = proc?.step;
  if (step?.kind === 'convert') {
    return (
      <View accessibilityLiveRegion="polite" style={[styles.big, styles.inline, { backgroundColor: c.surface, borderColor: c.primary }]}>
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
  inline: { shadowOpacity: 0, elevation: 0 },
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
