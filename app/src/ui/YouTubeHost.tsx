import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeYoutube, PipCorner, showPlayer, usePlayerSelect, youtubeView } from '../player/player';
import { Icon } from './Icon';
import { cardShadow, radius, space, useTheme } from './theme';
import { useStore } from './useStore';
import { YouTubeView } from './YouTubeView';

/** YouTube's terms: an embedded player at least 200 × 200 pt. */
const PIP_W = 224;
const PIP_H = 200;
const BAR_H = 48;
/** Below the status bar and a screen's header, so "חזרה" is never covered. */
const PIP_TOP = 56;
/** Above the mini player and the tabs. */
const PIP_BOTTOM = 150;
/** A finger has to move this far before the window follows it (a shorter touch is a tap). */
const DRAG_SLOP = 6;

/**
 * The one YouTube player of the app, above every screen. On the full player it sits in the
 * screen's slot; anywhere else it shrinks to a small window, still playing and visible, so she
 * can pick the next songs meanwhile (owner, 0.11). She drags it by its bar to any corner
 * (0.11.1) — it snaps there and stays there. ⤢ brings the full player back, ✕ stops the
 * video. Same component in both places, so the video never restarts.
 *
 * Laid out left-to-right: the slot's frame and the corners are physical screen coordinates.
 */
export function YouTubeHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const videoId = usePlayerSelect((s) => (s.song?.kind === 'youtube' ? s.song.youtubeId : null));
  const { frame, closed, corner } = useStore(youtubeView);

  const corners = useMemo(() => {
    const left = space.m;
    const right = screenW - PIP_W - space.m;
    const top = insets.top + PIP_TOP;
    const bottom = screenH - insets.bottom - PIP_BOTTOM - PIP_H - BAR_H;
    return {
      'top-start': { x: right, y: top }, // RTL: start is the right edge
      'top-end': { x: left, y: top },
      'bottom-start': { x: right, y: bottom },
      'bottom-end': { x: left, y: bottom },
    } satisfies Record<PipCorner, { x: number; y: number }>;
  }, [screenW, screenH, insets.top, insets.bottom]);

  const pos = useRef(new Animated.ValueXY(corners[corner])).current;
  const dragging = useRef(false);
  const cornersRef = useRef(corners);
  cornersRef.current = corners;

  // Follow the slot, or the chosen corner, unless her finger is on the window.
  useEffect(() => {
    if (dragging.current) return;
    pos.stopAnimation();
    pos.setValue(frame ? { x: frame.x, y: frame.y } : corners[corner]);
  }, [frame, corner, corners, pos]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Capture, so a drag that starts on ⤢ or ✕ still moves the window instead of tapping.
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
        onPanResponderGrant: () => {
          dragging.current = true;
          pos.stopAnimation();
          pos.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => settle(g.dx, g.dy),
        onPanResponderTerminate: (_, g) => settle(g.dx, g.dy),
      }),
    [],
  );

  function settle(dx: number, dy: number) {
    pos.flattenOffset();
    const all = cornersRef.current;
    const from = all[youtubeView.get().corner];
    const cx = from.x + dx + PIP_W / 2;
    const cy = from.y + dy + (PIP_H + BAR_H) / 2;
    let best: PipCorner = 'bottom-end';
    let bestD = Infinity;
    for (const k of Object.keys(all) as PipCorner[]) {
      const d = (all[k].x + PIP_W / 2 - cx) ** 2 + (all[k].y + (PIP_H + BAR_H) / 2 - cy) ** 2;
      if (d < bestD) [best, bestD] = [k, d];
    }
    Animated.spring(pos, { toValue: all[best], useNativeDriver: false, bounciness: 4 }).start(() => {
      dragging.current = false;
    });
    youtubeView.set({ corner: best });
  }

  if (!videoId || closed) return null;

  const size = frame ? { width: frame.width, height: frame.height } : { width: PIP_W, height: PIP_H + BAR_H };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
      <Animated.View
        style={[
          styles.box,
          size,
          { transform: pos.getTranslateTransform() },
          frame ? null : [styles.pip, cardShadow, { backgroundColor: c.surface }],
        ]}
      >
        <YouTubeView videoId={videoId} compact={!frame} style={frame ? { flex: 1 } : { height: PIP_H, borderRadius: radius.m }} />
        {frame ? null : (
          <View
            {...pan.panHandlers}
            style={styles.bar}
            accessibilityHint="גררי את הפס כדי להזיז את החלון לפינה אחרת"
          >
            <Pressable
              onPress={closeYoutube}
              accessibilityRole="button"
              accessibilityLabel="סגירת הסרטון"
              hitSlop={4}
              style={[styles.btn, { backgroundColor: c.surfaceAlt }]}
            >
              <Icon name="close" size={22} color={c.ink} />
            </Pressable>
            <View style={styles.grip} accessible accessibilityLabel="הזזת החלון">
              <View style={[styles.gripLine, { backgroundColor: c.line }]} />
              <View style={[styles.gripLine, { backgroundColor: c.line }]} />
            </View>
            <Pressable
              onPress={showPlayer}
              accessibilityRole="button"
              accessibilityLabel="פתיחת הנגן המלא"
              hitSlop={4}
              style={[styles.btn, { backgroundColor: c.surfaceAlt }]}
            >
              <Icon name="expand" size={20} color={c.ink} />
            </Pressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, top: 0 },
  pip: { borderRadius: radius.m, overflow: 'visible' },
  bar: { height: BAR_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xs },
  btn: { width: 44, height: 40, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  grip: { flex: 1, height: BAR_H, alignItems: 'center', justifyContent: 'center', gap: 4 },
  gripLine: { width: 36, height: 4, borderRadius: 2 },
});
