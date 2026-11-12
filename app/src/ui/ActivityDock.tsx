import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { batchProgress, describeProgress, Stage, stageOf } from '../core/progress';
import { useLibrary } from '../db/useLibrary';
import { batchStore, clearBatch } from '../ingest/batch';
import { importStore } from '../ingest/ingest';
import { processorStore } from '../ingest/processor';
import { T } from './components';
import { Icon, IconName } from './Icon';
import { shareOutStore } from './share';
import { radius, space, useTheme } from './theme';
import { useAiConnected } from './useAiConnected';
import { useStore } from './useStore';

/** How long "all ready" stays before the dock folds away by itself. */
const DONE_MS = 6000;

const STAGE: Record<Stage, { label: string; icon: IconName }> = {
  preparing: { label: 'בהכנה לניגון', icon: 'musical-notes' },
  naming: { label: 'מקבל שם ומילים', icon: 'sparkles' },
  ready: { label: 'מוכן', icon: 'checkmark-circle' },
  failed: { label: 'לא הצליח', icon: 'alert-circle' },
};

/**
 * Work on songs, at the bottom of the main screens just above the mini player (owner, 0.14.1):
 * saving a share ("3 מתוך 10"), preparing a list to share out, and then the songs that came in
 * together on their way to ready — how many are ready, preparing, being named. It sits in the
 * screen's layout, not over it, so it never covers a button; one line, with a bar, until she
 * taps it for the list of songs. When all are ready it says so and folds away. Work outside a
 * share (trying failed songs again) shows here as one line too.
 */
export function ActivityDock() {
  const c = useTheme();
  const imp = useStore(importStore);
  const out = useStore(shareOutStore);
  const ids = useStore(batchStore, (s) => s.ids);
  const step = useStore(processorStore, (s) => s.step);
  const ai = useAiConnected();
  const lib = useLibrary();
  const [open, setOpen] = useState(false);

  const songs = ids.map((id) => lib.byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  const progress = batchProgress(songs, ai);
  const finished = songs.length > 0 && progress.finished;

  // All ready: say so, then fold away (unless she opened the list to look).
  useEffect(() => {
    if (!finished || open) return;
    const t = setTimeout(clearBatch, DONE_MS);
    return () => clearTimeout(t);
  }, [finished, open]);
  // Songs deleted meanwhile leave the batch; an empty one clears.
  useEffect(() => {
    if (ids.length && !songs.length && lib.songs.length) clearBatch();
  }, [ids.length, songs.length, lib.songs.length]);

  let line: { title: string; detail: string; fraction: number | null; icon: 'busy' | IconName } | null = null;
  if (imp?.saving) {
    line = {
      title: 'שומרת שירים חדשים',
      detail: (imp.total > 1 ? `${Math.min(imp.done + 1, imp.total)} מתוך ${imp.total}` : 'רגע אחד') + (imp.queued ? ` · ועוד ${imp.queued} שיתופים בתור` : ''),
      fraction: imp.total > 1 ? imp.done / imp.total : null,
      icon: 'busy',
    };
  } else if (out?.total) {
    line = {
      title: `מכינה ${out.total} שירים לשיתוף`,
      detail: `${Math.min(out.done + 1, out.total)} מתוך ${out.total}`,
      fraction: out.done / out.total,
      icon: 'busy',
    };
  } else if (songs.length) {
    const text = describeProgress(progress);
    line = {
      ...text,
      fraction: (progress.ready + progress.failed) / progress.total,
      icon: finished ? (progress.failed ? 'alert-circle' : 'checkmark-circle') : 'busy',
    };
  } else if (step) {
    line = {
      title: step.kind === 'convert' ? 'מכינה לניגון' : 'נותנת שם ומילים',
      detail: step.title + (step.left > 1 ? ` · ועוד ${step.left - 1}` : ''),
      fraction: null,
      icon: 'busy',
    };
  }
  if (!line) return null;

  const tint = line.icon === 'alert-circle' ? c.bad : line.icon === 'checkmark-circle' ? c.good : c.primary;
  const listable = !imp?.saving && !out?.total && songs.length > 0;
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Pressable
        disabled={!listable}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole={listable ? 'button' : undefined}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${line.title}. ${line.detail}`}
        accessibilityHint={listable ? (open ? 'סגירת רשימת השירים' : 'פתיחת רשימת השירים') : undefined}
        accessibilityState={listable ? { expanded: open } : undefined}
        style={styles.row}
      >
        {line.icon === 'busy' ? <ActivityIndicator color={c.primary} /> : <Icon name={line.icon} size={24} color={tint} />}
        <View style={{ flex: 1 }}>
          <T weight="bold" size={15} numberOfLines={1}>{line.title}</T>
          <T soft size={13} numberOfLines={1}>{line.detail}</T>
        </View>
        {listable ? <Icon name={open ? 'chevron-down' : 'chevron-up'} size={20} color={c.inkSoft} /> : null}
        {finished ? (
          <Pressable onPress={clearBatch} accessibilityLabel="סגירה" hitSlop={8} style={styles.close}>
            <Icon name="close" size={18} color={c.inkSoft} />
          </Pressable>
        ) : null}
      </Pressable>
      {line.fraction !== null ? (
        <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
          <View style={[styles.fill, { backgroundColor: tint, width: `${Math.max(4, line.fraction * 100)}%` }]} />
        </View>
      ) : null}
      {open && listable ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {songs.map((s) => {
            const st = STAGE[stageOf(s, ai)];
            const color = st.icon === 'alert-circle' ? c.bad : st.icon === 'checkmark-circle' ? c.good : c.inkSoft;
            return (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: '/song/[id]', params: { id: s.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}: ${st.label}`}
                style={styles.item}
              >
                <Icon name={st.icon} size={18} color={color} />
                <T size={15} numberOfLines={1} style={{ flex: 1 }}>{s.title}</T>
                <T soft size={13}>{st.label}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space.s,
    marginBottom: space.s,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingHorizontal: space.m, paddingVertical: space.s },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, direction: 'ltr' },
  fill: { height: 4 },
  list: { maxHeight: 220 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44, paddingHorizontal: space.m },
});
