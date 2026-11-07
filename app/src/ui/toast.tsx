import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityBanner } from './ActivityBanner';
import { T } from './components';
import { Icon, IconName } from './Icon';
import { cardShadow, radius, space, useTheme } from './theme';

export type ToastKind = 'success' | 'info' | 'error';
type Listener = (msg: string, kind: ToastKind) => void;
const listeners = new Set<Listener>();

/** Show a short message, e.g. "3 שירים נשמרו", without a blocking dialog. */
export function toast(msg: string, kind: ToastKind = 'info') {
  listeners.forEach((l) => l(msg, kind));
}

/** The navigation header's height (iOS 44, Android 56): the banner starts below it. */
const HEADER_H = Platform.OS === 'ios' ? 44 : 56;

const ICON: Record<ToastKind, IconName> = { success: 'checkmark-circle', info: 'information-circle', error: 'alert-circle' };

/**
 * Top of every screen, just below the header (it sits in the root layout, above the
 * navigator): the status banner while songs are being saved or processed, and below it the
 * latest toast. Nothing in it takes a tap. Large and high
 * contrast on purpose — the owner found the old one-line toast too easy to miss.
 */
export function StatusHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const l: Listener = (text, kind) => {
      setMsg({ text, kind });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // A new toast during the fade interrupts it (finished = false): keep showing that one.
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMsg(null);
        });
      }, 3500);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [opacity]);

  const tint = msg?.kind === 'success' ? c.good : msg?.kind === 'error' ? c.bad : c.primary;

  return (
    // Below the header and never in the way of a tap: it used to sit over "חזרה" and swallow it
    // for as long as songs were being named — back seemed broken on every screen (owner, 0.11).
    <View pointerEvents="none" style={[styles.host, { top: insets.top + HEADER_H + space.s }]}>
      <ActivityBanner />
      {msg ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: c.surface, borderColor: tint, opacity }]}
        >
          <Icon name={ICON[msg.kind]} size={28} color={tint} />
          <T weight="bold" size={17} style={{ flex: 1 }}>{msg.text}</T>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', start: space.m, end: space.m, gap: space.s, zIndex: 100, elevation: 8 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.m,
    borderWidth: 2,
    ...cardShadow,
  },
});
