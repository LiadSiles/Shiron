import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CATEGORIES, CategoryGroup, GROUP_NAMES, getCategory } from '../core/categories';
import { categoryCounts, LibraryState } from '../db/useLibrary';
import { CategoryBadge, EmptyState, SectionTitle, T } from '../ui/components';
import { radius, space, useTheme } from '../ui/theme';

export function LibraryScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const counts = new Map(categoryCounts(lib).map((x) => [x.id, x.count]));
  const groups = Object.keys(GROUP_NAMES) as CategoryGroup[];
  const total = lib.songs.filter((s) => s.status !== 'review').length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <T weight="bold" size={28}>ספרייה</T>
      <T soft>{total} שירים</T>

      {total === 0 && !lib.loading ? (
        <EmptyState icon="📚" title="עוד אין שירים" body="שירים שתשתפי מוואטסאפ יסודרו כאן לפי נושאים." />
      ) : null}

      {total > 0 ? (
        <Pressable
          onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'all' } })}
          style={[styles.allTile, { backgroundColor: c.surface, borderColor: c.line }]}
        >
          <T size={24}>🎵</T>
          <T weight="medium" size={17} style={{ flex: 1 }}>כל השירים</T>
          <T soft>{total}</T>
        </Pressable>
      ) : null}

      {groups.map((g) => {
        const cats = CATEGORIES.filter((cat) => cat.group === g && counts.has(cat.id));
        if (!cats.length) return null;
        return (
          <View key={g}>
            <SectionTitle>{GROUP_NAMES[g]}</SectionTitle>
            <View style={styles.grid}>
              {cats.map((cat) => (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat.name}, ${counts.get(cat.id)} שירים`}
                  onPress={() => router.push({ pathname: '/category/[id]', params: { id: cat.id } })}
                  style={({ pressed }) => [
                    styles.tile,
                    { backgroundColor: getCategory(cat.id).color + (pressed ? '33' : '1F'), borderColor: cat.color + '55' },
                  ]}
                >
                  <CategoryBadge id={cat.id} size={40} />
                  <T weight="medium" size={16} numberOfLines={2}>{cat.name}</T>
                  <T soft size={13}>{counts.get(cat.id)} שירים</T>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  tile: {
    width: '47%',
    flexGrow: 1,
    padding: space.m,
    borderRadius: radius.m,
    borderWidth: 1,
    gap: space.xs,
    minHeight: 112,
  },
  allTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space.l,
  },
});
