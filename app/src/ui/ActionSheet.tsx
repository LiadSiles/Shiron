import * as Haptics from 'expo-haptics';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { textOn } from '../core/color';
import { createStore } from '../core/store';
import { T } from './text';
import { Icon, IconName } from './Icon';
import { radius, space, useTheme } from './theme';
import { useStore } from './useStore';

export interface SheetAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Deleting or removing: red, and kept apart at the end. */
  danger?: boolean;
}

export interface Sheet {
  title: string;
  subtitle?: string;
  /** What the menu is about, as its tile: an emoji or an icon on its colour. */
  art?: { emoji?: string; icon?: IconName; color: string };
  actions: SheetAction[];
}

const sheetStore = createStore<{ sheet: Sheet | null }>({ sheet: null });

/**
 * A long press (or ⋮) on a song, a category or a list opens its actions here (owner, 0.15.0):
 * one sheet from the bottom, in thumb's reach, the thing's own tile and name at the top so she
 * sees what she is acting on, the actions as big rows, deleting set apart in red, and "ביטול".
 * A light tap of the phone says it opened.
 */
export function showActions(sheet: Sheet) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  sheetStore.set({ sheet });
}

const close = () => sheetStore.set({ sheet: null });

/** In the root layout, once. */
export function ActionSheetHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useStore(sheetStore, (s) => s.sheet);
  // The action runs once the sheet is gone: an alert or a new screen over a closing sheet is
  // dropped on iOS.
  const run = (a: SheetAction) => {
    close();
    setTimeout(a.onPress, 300);
  };
  const plain = sheet?.actions.filter((a) => !a.danger) ?? [];
  const danger = sheet?.actions.filter((a) => a.danger) ?? [];

  return (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: c.scrim }]} onPress={close} accessibilityLabel="סגירה" />
      {sheet ? (
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.m }]}
        >
          <View style={[styles.grip, { backgroundColor: c.line }]} />
          <View style={styles.head}>
            {sheet.art ? (
              <View style={[styles.art, { backgroundColor: sheet.art.color }]}>
                {sheet.art.emoji ? (
                  <T size={24}>{sheet.art.emoji}</T>
                ) : (
                  <Icon name={sheet.art.icon ?? 'musical-notes'} size={24} color={textOn(sheet.art.color)} />
                )}
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <T weight="bold" size={18} numberOfLines={2} accessibilityRole="header">{sheet.title}</T>
              {sheet.subtitle ? <T soft size={14} numberOfLines={1}>{sheet.subtitle}</T> : null}
            </View>
          </View>
          <ScrollView style={{ flexGrow: 0 }} bounces={false}>
            <Group actions={plain} run={run} />
            {danger.length ? <Group actions={danger} run={run} /> : null}
          </ScrollView>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, { backgroundColor: pressed ? c.line : c.surfaceAlt }]}
          >
            <T weight="bold" size={17}>ביטול</T>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}

function Group({ actions, run }: { actions: SheetAction[]; run: (a: SheetAction) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>
      {actions.map((a, i) => {
        const color = a.danger ? c.bad : c.ink;
        return (
          <Pressable
            key={a.label}
            onPress={() => run(a)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
              i < actions.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line } : null,
            ]}
          >
            <Icon name={a.icon} size={22} color={a.danger ? c.bad : c.primary} />
            <T size={17} weight="medium" style={{ color, flex: 1 }}>{a.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  panel: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopLeftRadius: radius.l,
    borderTopRightRadius: radius.l,
    paddingHorizontal: space.l,
    gap: space.m,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  art: { width: 48, height: 48, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: space.m },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 54, paddingHorizontal: space.l },
  cancel: { minHeight: 54, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
});
