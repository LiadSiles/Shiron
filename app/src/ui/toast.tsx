import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './components';
import { radius, space, useTheme } from './theme';

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

/** Show a short confirmation, e.g. "נשמר ✓", without a blocking dialog. */
export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

export function ToastHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const l: Listener = (m) => {
      setMsg(m);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // A new toast during the fade interrupts it (finished = false): keep showing that one.
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMsg(null);
        });
      }, 2800);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [opacity]);

  if (!msg) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { top: insets.top + space.s, backgroundColor: c.ink, opacity }]}
    >
      <T weight="medium" style={{ color: c.bg, textAlign: 'center' }}>{msg}</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    start: space.l,
    end: space.l,
    padding: space.m,
    borderRadius: radius.m,
    zIndex: 100,
    elevation: 6,
  },
});
