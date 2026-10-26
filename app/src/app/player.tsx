import { router } from 'expo-router';
import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCategory } from '../core/categories';
import { next, previous, seek, setRepeat, stop, toggle, usePlayer } from '../player/player';
import { CategoryBadge, T } from '../ui/components';
import { radius, space, useTheme } from '../ui/theme';

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Full player: one huge stop/play button, repeat for "עוד פעם!", lyrics below. */
export default function PlayerScreen() {
  const c = useTheme();
  const p = usePlayer();
  const barWidth = useRef(0);

  if (!p.song) {
    return (
      <View style={styles.center}>
        <T soft>אין שיר שמתנגן</T>
      </View>
    );
  }

  const catId = p.song.categories[0]?.categoryId ?? 'unsorted';
  const cat = getCategory(catId);
  const progress = p.duration > 0 ? p.position / p.duration : 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.art, { backgroundColor: cat.color + '26' }]}>
        <CategoryBadge id={catId} size={120} />
      </View>
      <T weight="bold" size={26} style={{ textAlign: 'center' }}>{p.song.title}</T>
      <T soft style={{ textAlign: 'center' }}>{cat.name}</T>

      {/* Tap anywhere on the bar to jump there. Rendered left-to-right like a timeline. */}
      <Pressable
        accessibilityLabel="מיקום בשיר"
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          if (barWidth.current > 0 && p.duration > 0) seek((x / barWidth.current) * p.duration);
        }}
        onLayout={(e) => {
          barWidth.current = e.nativeEvent.layout.width;
        }}
        style={[styles.bar, { backgroundColor: c.surfaceAlt, direction: 'ltr' }]}
      >
        <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: c.primary }]} />
      </Pressable>
      <View style={[styles.times, { direction: 'ltr' }]}>
        <T soft size={13}>{fmt(p.position)}</T>
        <T soft size={13}>{fmt(p.duration)}</T>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => previous()} accessibilityLabel="שיר קודם" style={[styles.side, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[styles.sideIcon, { color: c.ink }]}>⏮︎</Text>
        </Pressable>
        <Pressable
          onPress={() => (p.playing ? stop() : toggle())}
          accessibilityLabel={p.playing ? 'עצירה' : 'ניגון'}
          style={[styles.main, { backgroundColor: c.primary }]}
        >
          <Text style={{ fontSize: 40, color: c.primaryInk }}>{p.playing ? '■' : '▶︎'}</Text>
        </Pressable>
        <Pressable
          onPress={() => next()}
          disabled={p.index >= p.queue.length - 1}
          accessibilityLabel="השיר הבא"
          style={[styles.side, { backgroundColor: c.surfaceAlt, opacity: p.index >= p.queue.length - 1 ? 0.35 : 1 }]}
        >
          <Text style={[styles.sideIcon, { color: c.ink }]}>⏭︎</Text>
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
  bar: { height: 10, borderRadius: 5, overflow: 'hidden', marginTop: space.xl },
  barFill: { height: 10 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, marginTop: space.l },
  main: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  sideIcon: { fontSize: 22 },
  repeat: { alignSelf: 'center', marginTop: space.l, paddingVertical: space.m, paddingHorizontal: space.xl, borderRadius: radius.l, borderWidth: 1.5 },
});
