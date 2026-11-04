import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getCategory } from '../core/categories';
import { cycleRepeat, next, previous, seek, setPlayerScreenOpen, togglePlay, usePlayer } from '../player/player';
import { Button, CategoryBadge, T } from '../ui/components';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../ui/icons';
import { Scrubber } from '../ui/Scrubber';
import { Icon } from '../ui/Icon';
import { YouTubeView } from '../ui/YouTubeView';
import { radius, space, useTheme } from '../ui/theme';

const REPEAT_LABEL = {
  off: 'חזרה: כבויה',
  all: 'חוזר על כל הרשימה',
  one: 'חוזר על השיר הזה',
} as const;

/**
 * Full player: one huge play/pause button, a bar to drag through the song, repeat, lyrics.
 * A YouTube song shows YouTube's own player here (it may only play visibly).
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

  const catId = p.song.categories[0]?.categoryId ?? 'unsorted';
  const atEnd = p.index >= p.queue.length - 1 && p.repeat !== 'all';
  const cat = getCategory(catId);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {p.song.kind === 'youtube' && p.song.youtubeId ? (
        <View style={{ marginBottom: space.l }}>
          <YouTubeView videoId={p.song.youtubeId} />
        </View>
      ) : (
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

      <Pressable
        onPress={cycleRepeat}
        accessibilityRole="button"
        accessibilityHint="מחליף בין: בלי חזרה, חזרה על כל הרשימה, חזרה על השיר"
        style={[styles.repeat, { backgroundColor: p.repeat !== 'off' ? c.primarySoft : c.surfaceAlt, borderColor: p.repeat !== 'off' ? c.primary : 'transparent' }]}
      >
        <Icon name="repeat" size={20} color={p.repeat !== 'off' ? c.primary : c.inkSoft} />
        <T weight="medium">{REPEAT_LABEL[p.repeat]}</T>
      </Pressable>

      {p.song.kind === 'youtube' && p.song.youtubeId ? (
        <Button
          label="פתיחה באפליקציית יוטיוב"
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

      <Pressable onPress={() => router.push({ pathname: '/song/[id]', params: { id: p.song!.id } })} style={{ marginTop: space.xl, alignSelf: 'center' }}>
        <T weight="medium" style={{ color: c.primary }}>פרטי השיר ועריכה</T>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.xl, paddingBottom: 60, gap: space.s },
  art: { alignSelf: 'center', width: 200, height: 200, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center', marginBottom: space.l },
  controls: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, marginTop: space.l },
  main: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: space.s, alignSelf: 'center', marginTop: space.l, paddingVertical: space.m, paddingHorizontal: space.xl, borderRadius: radius.l, borderWidth: 1.5 },
});
