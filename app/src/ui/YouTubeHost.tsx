import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeYoutube, usePlayerSelect, youtubeView } from '../player/player';
import { Icon } from './Icon';
import { cardShadow, radius, space, useTheme } from './theme';
import { useStore } from './useStore';
import { YouTubeView } from './YouTubeView';

/** YouTube's terms: an embedded player at least 200 × 200 pt. */
const PIP_W = 224;
const PIP_H = 200;
/** Above the mini player and the tabs. */
const PIP_BOTTOM = 150;

/**
 * The one YouTube player of the app, above every screen. On the full player it sits in the
 * screen's slot; anywhere else it shrinks to a small window in the corner, still playing and
 * visible, so she can pick the next songs meanwhile (owner, 0.11). ⤢ brings the full player
 * back, ✕ stops the video. Same component in both places, so the video never restarts.
 */
export function YouTubeHost() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const videoId = usePlayerSelect((s) => (s.song?.kind === 'youtube' ? s.song.youtubeId : null));
  const { frame, closed } = useStore(youtubeView);
  if (!videoId || closed) return null;

  const box = frame
    ? { left: frame.x, top: frame.y, width: frame.width, height: frame.height }
    : { end: space.m, bottom: insets.bottom + PIP_BOTTOM, width: PIP_W, height: PIP_H + 48 };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.box, box, frame ? null : [styles.pip, cardShadow, { backgroundColor: c.surface }]]}>
        <YouTubeView videoId={videoId} compact={!frame} style={frame ? { flex: 1 } : { height: PIP_H, borderRadius: radius.m }} />
        {frame ? null : (
          <View style={styles.bar}>
            <Pressable
              onPress={() => router.push('/player')}
              accessibilityRole="button"
              accessibilityLabel="פתיחת הנגן המלא"
              hitSlop={4}
              style={[styles.btn, { backgroundColor: c.surfaceAlt }]}
            >
              <Icon name="expand" size={20} color={c.ink} />
            </Pressable>
            <Pressable
              onPress={closeYoutube}
              accessibilityRole="button"
              accessibilityLabel="סגירת הסרטון"
              hitSlop={4}
              style={[styles.btn, { backgroundColor: c.surfaceAlt }]}
            >
              <Icon name="close" size={22} color={c.ink} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute' },
  pip: { borderRadius: radius.m, padding: 0, overflow: 'visible' },
  bar: { height: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xs },
  btn: { width: 44, height: 40, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
});
