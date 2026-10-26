import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { getCategory } from '../core/categories';
import { textOn } from '../core/color';
import { categoryTiles, LibraryState } from '../db/useLibrary';
import { EmptyState, T } from '../ui/components';
import { radius, space, useTheme } from '../ui/theme';

const COLUMNS = 2;
const GAP = space.m;

/**
 * Every category as a square tile in two columns, Spotify-style: one level, no groups.
 * Categories without songs are hidden; what's in season and most used comes first.
 */
export function LibraryScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - space.l * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const tiles = useMemo(() => categoryTiles(lib), [lib]);
  const total = lib.songs.filter((s) => s.status !== 'review').length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <T weight="bold" size={28}>ספרייה</T>
      <T soft>{total} שירים</T>

      {total === 0 && !lib.loading ? (
        <EmptyState icon="📚" title="עוד אין שירים" body="שירים שתשתפי מוואטסאפ יסודרו כאן לפי נושאים." />
      ) : (
        <View style={[styles.grid, { marginTop: space.l }]}>
          <Tile
            size={size}
            name="כל השירים"
            icon="🎵"
            color={c.primary}
            count={total}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'all' } })}
          />
          {tiles.map((t) => {
            const cat = getCategory(t.id);
            return (
              <Tile
                key={t.id}
                size={size}
                name={cat.name}
                icon={cat.icon}
                color={cat.color}
                count={t.count}
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: t.id } })}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Tile({ size, name, icon, color, count, onPress }: {
  size: number;
  name: string;
  icon: string;
  color: string;
  count: number;
  onPress: () => void;
}) {
  const ink = textOn(color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count} שירים`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size, backgroundColor: color, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <T weight="bold" size={19} numberOfLines={2} style={{ color: ink }}>{name}</T>
      <T size={13} style={{ color: ink, opacity: 0.8, marginTop: 2 }}>{count === 1 ? 'שיר אחד' : `${count} שירים`}</T>
      {/* Big tilted emoji in the bottom corner, partly cut off — the Spotify "browse" look. */}
      <T size={Math.round(size * 0.42)} style={styles.art} accessible={false}>{icon}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    borderRadius: radius.m,
    padding: space.m,
    overflow: 'hidden',
  },
  art: {
    position: 'absolute',
    bottom: -6,
    end: -8,
    transform: [{ rotate: '-20deg' }],
  },
});
