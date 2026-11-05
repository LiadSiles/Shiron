import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { getCategory } from '../core/categories';
import { textOn } from '../core/color';
import { songCount } from '../core/playlists';
import { ALL_ID, categoryTiles, LibraryState, RECENT_ID, recentlyAdded } from '../db/useLibrary';
import { EmptyState, SectionTitle, T } from '../ui/components';
import { Icon, IconName } from '../ui/Icon';
import { newPlaylist, openPlaylist, playlistColor } from '../ui/playlists';
import { radius, space, useTheme } from '../ui/theme';

const COLUMNS = 2;
const GAP = space.m;

/**
 * Her own lists first ("הרשימות שלי", with a tile to start a new one), then every category as a
 * square tile in two columns, Spotify-style: one level, no groups. Categories without songs are
 * hidden; what's in season and most used comes first.
 */
export function LibraryScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - space.l * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const tiles = useMemo(() => categoryTiles(lib), [lib]);
  const recent = useMemo(() => recentlyAdded(lib).length, [lib]);
  const total = lib.songs.length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <T weight="bold" size={28}>ספרייה</T>
      <T soft>{total} שירים</T>

      {total === 0 && !lib.loading ? (
        <EmptyState icon="library-outline" title="עוד אין שירים" body="שירים שתשתפי מוואטסאפ יסודרו כאן לפי נושאים." />
      ) : (
        <>
        <SectionTitle>הרשימות שלי</SectionTitle>
        <View style={styles.grid}>
          {lib.playlists.map((p) => (
            <Tile
              key={p.id}
              size={size}
              name={p.name}
              icon="list"
              color={playlistColor(p.id)}
              count={p.songIds.length}
              onPress={() => openPlaylist(p.id)}
            />
          ))}
          <NewTile size={size} />
        </View>

        <SectionTitle>קטגוריות</SectionTitle>
        <View style={styles.grid}>
          <Tile
            size={size}
            name="כל השירים"
            icon="musical-notes"
            color={c.primary}
            count={total}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: ALL_ID } })}
          />
          {recent ? (
            <Tile
              size={size}
              name="נוספו לאחרונה"
              icon="sparkles"
              color={c.accent}
              count={recent}
              onPress={() => router.push({ pathname: '/category/[id]', params: { id: RECENT_ID } })}
            />
          ) : null}
          {tiles.map((t) => {
            const cat = getCategory(t.id);
            return (
              <Tile
                key={t.id}
                size={size}
                name={cat.name}
                emoji={cat.icon}
                color={cat.color}
                count={t.count}
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: t.id } })}
              />
            );
          })}
        </View>
        </>
      )}
    </ScrollView>
  );
}

function Tile({ size, name, icon, emoji, color, count, onPress }: {
  size: number;
  name: string;
  /** The big art in the corner: an icon, or a category's own emoji. */
  icon?: IconName;
  emoji?: string;
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
      <T size={13} style={{ color: ink, opacity: 0.8, marginTop: 2 }}>{songCount(count)}</T>
      {/* Big tilted art in the bottom corner, partly cut off — the Spotify "browse" look. */}
      {emoji ? (
        <T size={Math.round(size * 0.42)} style={styles.art} accessible={false}>{emoji}</T>
      ) : (
        <View style={styles.art} accessible={false}>
          <Icon name={icon ?? 'musical-notes'} size={Math.round(size * 0.42)} color={ink} />
        </View>
      )}
    </Pressable>
  );
}

/** Start a new list: a dashed square at the end of her lists. */
function NewTile({ size }: { size: number }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="רשימה חדשה"
      onPress={newPlaylist}
      style={({ pressed }) => [
        styles.tile,
        styles.newTile,
        { width: size, height: size, borderColor: c.line, backgroundColor: pressed ? c.surfaceAlt : c.surface },
      ]}
    >
      <Icon name="add-circle" size={48} color={c.primary} />
      <T weight="bold" size={17}>רשימה חדשה</T>
      <T soft size={13} style={{ textAlign: 'center' }}>בחרי שירים, בסדר שלך</T>
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
  newTile: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  art: {
    position: 'absolute',
    bottom: -6,
    end: -8,
    transform: [{ rotate: '-20deg' }],
  },
});
