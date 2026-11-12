import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconName } from './Icon';
import { T } from './text';
import { space, TOUCH, useTheme } from './theme';

/**
 * Choosing several songs to act on at once (owner, 0.15.0): to play, add to a list, share or
 * delete them together. A screen keeps the selection; null = not selecting. Android's back
 * button ends it before it leaves the screen.
 */
export function useSelection() {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const end = useCallback(() => setIds(null), []);

  useFocusEffect(
    useCallback(() => {
      if (!ids) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setIds(null);
        return true;
      });
      return () => sub.remove();
    }, [ids]),
  );

  return {
    active: ids !== null,
    ids: ids ?? new Set<string>(),
    /** Starts selecting, with this song already checked. */
    start: (id?: string) => setIds(new Set(id ? [id] : [])),
    toggle: (id: string) =>
      setIds((cur) => {
        const next = new Set(cur ?? []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (all: string[]) => setIds(new Set(all)),
    end,
  };
}

export type Selection = ReturnType<typeof useSelection>;

/** The header while selecting: "3 נבחרו", "ביטול" where back was, "הכול" / "ניקוי". */
export function selectionHeader(sel: Selection, allIds: string[]) {
  const n = sel.ids.size;
  const everything = n === allIds.length && n > 0;
  return {
    title: n ? `${n} נבחרו` : 'בחירת שירים',
    headerBackVisible: false,
    gestureEnabled: false,
    headerLeft: () => <HeaderText label="ביטול" onPress={sel.end} />,
    headerRight: () => (
      <HeaderText label={everything ? 'ניקוי' : 'בחירת הכול'} onPress={() => sel.setAll(everything ? [] : allIds)} />
    ),
  };
}

function HeaderText({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.headerBtn}>
      <T weight="medium" size={17} style={{ color: c.primary }}>{label}</T>
    </Pressable>
  );
}

/** The header button that starts selecting. */
export function SelectButton({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="בחירת כמה שירים" style={styles.headerBtn}>
      <T weight="medium" size={17} style={{ color: c.primary }}>בחירה</T>
    </Pressable>
  );
}

export interface BulkAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

/**
 * While selecting, in place of the mini player: what can be done with the songs checked, as
 * big icon-and-word buttons. Nothing checked → they wait, dimmed.
 */
export function SelectionBar({ count, actions }: { count: number; actions: BulkAction[] }) {
  const c = useTheme();
  return (
    // The screens already keep clear of the home indicator (their SafeAreaView).
    <View style={[styles.bar, { backgroundColor: c.surface, borderColor: c.line }]}>
      <View style={styles.row}>
        {actions.map((a) => {
          const color = a.danger ? c.bad : c.primary;
          return (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              disabled={!count}
              accessibilityRole="button"
              accessibilityState={{ disabled: !count }}
              style={({ pressed }) => [styles.action, { opacity: count ? (pressed ? 0.6 : 1) : 0.35 }]}
            >
              <Icon name={a.icon} size={24} color={color} />
              <T size={13} weight="medium" style={{ color }}>{a.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', paddingVertical: space.s },
  action: { flex: 1, minHeight: TOUCH + 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
