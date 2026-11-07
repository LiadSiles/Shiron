import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { getCategory } from '../core/categories';
import { textOn } from '../core/color';
import { songCount } from '../core/playlists';
import { CATEGORY_SORTS, sortCategories } from '../core/sorting';
import { ALL_ID, categoryTiles, LibraryState, RECENT_ID, recentlyAdded } from '../core/library';
import { CategoryBadge, EmptyState, SectionTitle, T } from '../ui/components';
import { ListGroup, ListItem } from '../ui/list';
import { useStore } from '../ui/useStore';
import { setViewPref, viewPrefs } from '../ui/viewPrefs';
import { ViewControls } from '../ui/ViewControls';
import { Icon, IconName } from '../ui/Icon';
import { newPlaylist, openPlaylist, playlistColor } from '../ui/playlists';
import { radius, space, useTheme } from '../ui/theme';

const COLUMNS = 2;
const GAP = space.m;

/**
 * Her own lists first ("הרשימות שלי", with a tile to start a new one), then every category —
 * as square tiles in two columns (Spotify-style) or as rows, in the order she picks (in season
 * and most used first, by default). Built-in categories without songs are hidden; hers show,
 * and a "קטגוריה חדשה" tile adds one.
 */
export function LibraryScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - space.l * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const prefs = useStore(viewPrefs);
  const tiles = useMemo(() => sortCategories(categoryTiles(lib), prefs.categorySort), [lib, prefs.categorySort]);
  const asRows = prefs.libraryLayout === 'rows';
  const openCategory = (id: string) => router.push({ pathname: '/category/[id]', params: { id } });
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
          <NewTile size={size} title="רשימה חדשה" body="בחרי שירים, בסדר שלך" onPress={newPlaylist} />
        </View>

        <SectionTitle>קטגוריות</SectionTitle>
        <ViewControls
          sorts={CATEGORY_SORTS}
          sort={prefs.categorySort}
          onSort={(categorySort) => setViewPref({ categorySort })}
          layout={prefs.libraryLayout}
          onLayout={(libraryLayout) => setViewPref({ libraryLayout })}
        />
        {asRows ? (
          <ListGroup>
            <ListItem icon="musical-notes" title="כל השירים" value={String(total)} onPress={() => openCategory(ALL_ID)} />
            {recent ? <ListItem icon="sparkles" tint={c.accent} title="נוספו לאחרונה" value={String(recent)} onPress={() => openCategory(RECENT_ID)} /> : null}
            {tiles.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => openCategory(t.id)}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}, ${songCount(t.count)}`}
                style={({ pressed }) => [styles.catRow, { borderBottomColor: c.line, backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
              >
                <CategoryBadge id={t.id} size={40} />
                <T weight="medium" size={17} style={{ flex: 1 }} numberOfLines={1}>{t.name}</T>
                <T soft size={14}>{songCount(t.count)}</T>
                <Icon name="chevron-back" size={18} color={c.inkSoft} />
              </Pressable>
            ))}
            <ListItem icon="add" title="קטגוריה חדשה" onPress={newCategory} last />
          </ListGroup>
        ) : (
          <View style={styles.grid}>
            <Tile size={size} name="כל השירים" icon="musical-notes" color={c.primary} count={total} onPress={() => openCategory(ALL_ID)} />
            {recent ? (
              <Tile size={size} name="נוספו לאחרונה" icon="sparkles" color={c.accent} count={recent} onPress={() => openCategory(RECENT_ID)} />
            ) : null}
            {tiles.map((t) => {
              const cat = getCategory(t.id);
              return (
                <Tile key={t.id} size={size} name={cat.name} emoji={cat.icon} color={cat.color} count={t.count} onPress={() => openCategory(t.id)} />
              );
            })}
            <NewTile size={size} title="קטגוריה חדשה" body="נושא משלך" onPress={newCategory} />
          </View>
        )}
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

function newCategory() {
  router.push('/category/edit');
}

/** Start something new (a list, a category): a dashed square at the end of the grid. */
function NewTile({ size, title, body, onPress }: { size: number; title: string; body: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        styles.newTile,
        { width: size, height: size, borderColor: c.line, backgroundColor: pressed ? c.surfaceAlt : c.surface },
      ]}
    >
      <Icon name="add-circle" size={48} color={c.primary} />
      <T weight="bold" size={17}>{title}</T>
      <T soft size={13} style={{ textAlign: 'center' }}>{body}</T>
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
  catRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.m, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  newTile: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  art: {
    position: 'absolute',
    bottom: -6,
    end: -8,
    transform: [{ rotate: '-20deg' }],
  },
});
