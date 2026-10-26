import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { getCategory } from '../core/categories';
import type { SongWithCategories } from '../core/types';
import { confirmSong, setCategories } from '../db/repo';
import { LibraryState } from '../db/useLibrary';
import { retrySong } from '../ingest/processor';
import { Button, CategoryBadge, EmptyState, playOrOpen, T } from '../ui/components';
import { toast } from '../ui/toast';
import { radius, space, useTheme } from '../ui/theme';

function ReviewCard({ song }: { song: SongWithCategories }) {
  const c = useTheme();
  // Pre-select the AI's top suggestion; the teacher can switch with one tap.
  const [selected, setSelected] = useState<string[]>(song.categories.slice(0, 1).map((x) => x.categoryId));

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const approve = async () => {
    await setCategories(
      song.id,
      selected.map((id) => ({ id, confidence: song.categories.find((x) => x.categoryId === id)?.confidence ?? 1, confirmed: true })),
    );
    await confirmSong(song.id);
    toast(`נכנס לספרייה: ${song.title}`);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Pressable onPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })} accessibilityHint="פתיחה לעריכת השם">
        <T soft size={13}>שם מוצע · הקשה לעריכה</T>
        <T weight="bold" size={20}>{song.title}</T>
      </Pressable>
      {song.lyrics ? <T soft size={14} numberOfLines={2}>{song.lyrics}</T> : null}
      {song.error ? (
        <View style={styles.errorRow}>
          <T size={14} style={{ flex: 1, color: c.warn }}>{song.error}</T>
          <Button label="לנסות שוב" kind="quiet" onPress={() => retrySong(song.id)} />
        </View>
      ) : null}

      <T soft size={13} style={{ marginTop: space.s }}>קטגוריה</T>
      <View style={styles.chips}>
        {song.categories.map((cat) => {
          const on = selected.includes(cat.categoryId);
          const meta = getCategory(cat.categoryId);
          return (
            <Pressable
              key={cat.categoryId}
              onPress={() => toggle(cat.categoryId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.chip, { backgroundColor: on ? meta.color + '33' : c.surfaceAlt, borderColor: on ? meta.color : 'transparent' }]}
            >
              <CategoryBadge id={cat.categoryId} size={26} />
              <T weight={on ? 'medium' : 'regular'}>{meta.name}</T>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })}
          style={[styles.chip, { backgroundColor: c.surfaceAlt, borderColor: 'transparent' }]}
        >
          <T>אחר…</T>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Button label="אישור" icon="✓" onPress={approve} disabled={!selected.length} style={{ flex: 2 }} />
        <Button label="האזנה" icon="▶︎" kind="quiet" onPress={() => playOrOpen(song, [song])} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function ReviewScreen({ lib }: { lib: LibraryState }) {
  const items = lib.songs.filter((s) => s.status === 'review');
  return (
    <FlatList
      data={items}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: space.l, paddingBottom: 40 }}
      ListHeaderComponent={
        <View style={{ marginBottom: space.m }}>
          <T weight="bold" size={28}>לבדיקה</T>
          <T soft>שירים שהמערכת לא הייתה בטוחה לגביהם. שירים ברורים נכנסים לספרייה לבד.</T>
        </View>
      }
      renderItem={({ item }) => <ReviewCard song={item} />}
      ListEmptyComponent={<EmptyState icon="✅" title="הכול מסודר" body="אין שירים שמחכים לאישור." />}
    />
  );
}

const styles = StyleSheet.create({
  card: { padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.m, gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: 6, paddingHorizontal: space.m, borderRadius: radius.l, borderWidth: 1.5, minHeight: 44 },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
