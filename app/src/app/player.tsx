import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getCategory } from '../core/categories';
import { next, previous, seek, setRepeat, togglePlay, usePlayer } from '../player/player';
import { CategoryBadge, T } from '../ui/components';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../ui/icons';
import { Scrubber } from '../ui/Scrubber';
import { radius, space, useTheme } from '../ui/theme';

/** Full player: one huge play/pause button, a bar to drag through the song, repeat, lyrics. */
export default function PlayerScreen() {
  const c = useTheme();
  const p = usePlayer();

  if (!p.song) {
    return (
      <View style={styles.center}>
        <T soft>אין שיר שמתנגן</T>
      </View>
    );
  }

  const catId = p.song.categories[0]?.categoryId ?? 'unsorted';
  const cat = getCategory(catId);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.art, { backgroundColor: cat.color + '26' }]}>
        <CategoryBadge id={catId} size={120} />
      </View>
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
          disabled={p.index >= p.queue.length - 1}
          accessibilityLabel="השיר הבא"
          style={[styles.side, { backgroundColor: c.surfaceAlt, opacity: p.index >= p.queue.length - 1 ? 0.35 : 1 }]}
        >
          <NextIcon size={20} color={c.ink} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setRepeat(!p.repeat)}
        accessibilityRole="switch"
        accessibilityState={{ checked: p.repeat }}
        style={[styles.repeat, { backgroundColor: p.repeat ? c.primarySoft : c.surfaceAlt, borderColor: p.repeat ? c.primary : 'transparent' }]}
      >
        <T weight="medium">🔁 {p.repeat ? 'חוזר על השיר' : 'עוד פעם! (חזרה על השיר)'}</T>
      </Pressable>

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
  repeat: { alignSelf: 'center', marginTop: space.l, paddingVertical: space.m, paddingHorizontal: space.xl, borderRadius: radius.l, borderWidth: 1.5 },
});
