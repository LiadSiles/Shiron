import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, ViewInstance } from 'react-native';
import { getCategory, primaryCategoryId } from '../core/categories';
import { cycleRepeat, next, previous, seek, setPlayerScreenOpen, togglePlay, usePlayer, youtubeView } from '../player/player';
import { Button, CategoryBadge, T } from '../ui/components';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../ui/icons';
import { Scrubber } from '../ui/Scrubber';
import { ActionBar } from '../ui/list';
import { cardShadow, space, useTheme } from '../ui/theme';

/** Short enough for an action tile: off → the whole list → this song. */
const REPEAT_LABEL = {
  off: 'בלי חזרה',
  all: 'חזרה על הכול',
  one: 'חזרה על השיר',
} as const;

/**
 * Full player: one huge play/pause button, a bar to drag through the song, repeat, lyrics.
 * A YouTube song shows YouTube's own player at the top (it may only play visibly): the app-wide
 * player (ui/YouTubeHost) is placed over this screen's slot, and shrinks to a small window when
 * she leaves, so the video keeps playing while she browses.
 */
export default function PlayerScreen() {
  const c = useTheme();
  const p = usePlayer();

  useEffect(() => {
    setPlayerScreenOpen(true);
    return () => setPlayerScreenOpen(false);
  }, []);

  if (!p.song) {
    return (
      <View style={styles.center}>
        <T soft>אין שיר שמתנגן</T>
      </View>
    );
  }

  const catId = primaryCategoryId(p.song);
  const atEnd = p.index >= p.queue.length - 1 && p.repeat !== 'all';
  const cat = getCategory(catId);

  const isYoutube = p.song.kind === 'youtube' && !!p.song.youtubeId;
  return (
    <View style={{ flex: 1 }}>
    {isYoutube ? <YouTubeSlot /> : null}
    <ScrollView contentContainerStyle={styles.content}>
      {isYoutube ? null : (
        <View style={[styles.art, { backgroundColor: cat.color + '26' }]}>
          <CategoryBadge id={catId} size={120} />
        </View>
      )}
      <T weight="bold" size={26} style={{ textAlign: 'center' }}>{p.song.title}</T>
      <T soft style={{ textAlign: 'center' }}>{cat.name}</T>

      {p.error ? (
        <T style={{ color: c.bad, textAlign: 'center' }}>לא הצלחנו לנגן את השיר: {p.error}</T>
      ) : null}

      <View style={{ marginTop: space.l }}>
        <Scrubber position={p.position} duration={p.duration} onSeek={seek} />
      </View>

      {/* Media controls are not mirrored in RTL: previous on the left, next on the right. */}
      <View style={styles.controls}>
        <Pressable onPress={() => previous()} accessibilityLabel="שיר קודם / לתחילת השיר" style={[styles.side, { backgroundColor: c.surfaceAlt }]}>
          <PreviousIcon size={20} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => togglePlay()}
          accessibilityLabel={p.playing ? 'השהיה' : 'ניגון'}
          style={[styles.main, { backgroundColor: c.primary }]}
        >
          {p.playing ? <PauseIcon size={34} color={c.primaryInk} /> : <PlayIcon size={34} color={c.primaryInk} />}
        </Pressable>
        <Pressable
          onPress={() => next()}
          disabled={atEnd}
          accessibilityLabel="השיר הבא"
          style={[styles.side, { backgroundColor: c.surfaceAlt, opacity: atEnd ? 0.35 : 1 }]}
        >
          <NextIcon size={20} color={c.ink} />
        </Pressable>
      </View>

      <View style={{ marginTop: space.xl }}>
        <ActionBar
          actions={[
            { icon: 'repeat', label: REPEAT_LABEL[p.repeat], active: p.repeat !== 'off', onPress: cycleRepeat },
            { icon: 'list', label: 'לרשימה', onPress: () => router.push({ pathname: '/playlist/add', params: { song: p.song!.id } }) },
            { icon: 'ellipsis-horizontal', label: 'פרטים', onPress: () => router.push({ pathname: '/song/[id]', params: { id: p.song!.id } }) },
          ]}
        />
      </View>

      {p.song.kind === 'youtube' && p.song.youtubeId ? (
        <Button
          label="פתיחה באפליקציית יוטיוב"
          icon="logo-youtube"
          kind="quiet"
          onPress={() => Linking.openURL(`https://youtu.be/${p.song!.youtubeId}`)}
          style={{ marginTop: space.s }}
        />
      ) : null}

      {p.song.lyrics ? (
        <View style={{ marginTop: space.xl, gap: space.s }}>
          <T weight="bold" size={18}>מילות השיר</T>
          <T style={{ lineHeight: 28, fontSize: 18 }}>{p.song.lyrics}</T>
        </View>
      ) : null}

    </ScrollView>
    </View>
  );
}

/**
 * Where YouTube's player shows on this screen: it reports its place on the window, and
 * ui/YouTubeHost puts the app's one player there (measured again after the screen slides in).
 */
function YouTubeSlot() {
  const ref = useRef<ViewInstance>(null);
  const measure = () =>
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) youtubeView.set({ frame: { x, y, width, height }, closed: false });
    });
  useEffect(() => {
    const timers = [150, 450, 900].map((ms) => setTimeout(measure, ms));
    return () => {
      timers.forEach(clearTimeout);
      youtubeView.set({ frame: null });
    };
  }, []);
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l }}>
      <View ref={ref} onLayout={measure} collapsable={false} style={{ aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.xl, paddingBottom: 60, gap: space.s },
  art: { alignSelf: 'center', width: 240, height: 240, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.l, ...cardShadow },
  controls: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, marginTop: space.l },
  main: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
