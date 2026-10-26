import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import { formatTime } from '../core/time';
import { T } from './components';
import { useTheme } from './theme';

/**
 * A progress bar she can drag to the part she wants (e.g. straight to the refrain).
 * Time runs left → right whatever the UI direction, like every media player.
 * While dragging, the thumb grows and shows the target time; seeking happens on release,
 * so the song doesn't stutter through every point on the way.
 */
export function Scrubber({ position, duration, onSeek }: {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const c = useTheme();
  const width = useRef(0);
  const startX = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const latest = useRef({ duration, onSeek });
  latest.current = { duration, onSeek };

  const fractionAt = (x: number) => (width.current > 0 ? Math.max(0, Math.min(1, x / width.current)) : 0);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.duration > 0,
        onMoveShouldSetPanResponder: () => latest.current.duration > 0,
        // Keep the gesture when the finger drifts vertically (e.g. inside the ScrollView).
        onPanResponderTerminationRequest: () => false,
        // Where the finger went down (relative to the bar), then follow the horizontal drag.
        onPanResponderGrant: (e) => {
          startX.current = e.nativeEvent.locationX;
          setDragging(fractionAt(startX.current));
        },
        onPanResponderMove: (_e, g) => setDragging(fractionAt(startX.current + g.dx)),
        onPanResponderRelease: (_e, g) => {
          const f = fractionAt(startX.current + g.dx);
          setDragging(null);
          latest.current.onSeek(f * latest.current.duration);
        },
        onPanResponderTerminate: () => setDragging(null),
      }),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
  };

  const fraction = dragging ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const shown = dragging != null ? dragging * duration : position;

  return (
    <View style={{ direction: 'ltr' }}>
      <View
        onLayout={onLayout}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="מיקום בשיר"
        accessibilityValue={{ text: `${formatTime(position)} מתוך ${formatTime(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onSeek(position + (e.nativeEvent.actionName === 'increment' ? 10 : -10))
        }
        style={styles.hit}
      >
        <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: c.primary }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            dragging != null ? styles.thumbActive : null,
            { left: `${fraction * 100}%`, backgroundColor: c.primary, borderColor: c.bg },
          ]}
        />
      </View>
      <View style={styles.times}>
        <T size={13} weight={dragging != null ? 'bold' : 'regular'} soft={dragging == null}>{formatTime(shown)}</T>
        <T soft size={13}>{formatTime(duration)}</T>
      </View>
    </View>
  );
}

const THUMB = 18;
const styles = StyleSheet.create({
  // Tall invisible touch area around a thin bar: easy to grab with a thumb.
  hit: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    marginLeft: -THUMB / 2,
    top: 22 - THUMB / 2,
    borderWidth: 2,
  },
  thumbActive: { transform: [{ scale: 1.4 }] },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
});
