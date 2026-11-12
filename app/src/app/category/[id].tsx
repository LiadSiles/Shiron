import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategory, UNSORTED_ID } from '../../core/categories';
import { canStart } from '../../core/ingestRules';
import { SONG_SORTS, sortSongs, steadyOrder } from '../../core/sorting';
import { ALL_ID, RECENT_ID, songsFor } from '../../core/library';
import { useLibrary } from '../../db/useLibrary';
import { Button, CategoryBadge, EmptyState, playAll, SongRow, SongTile, T } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { ActivityDock } from '../../ui/ActivityDock';
import { MiniPlayer } from '../../ui/MiniPlayer';
import { addToPlaylist, confirmDeleteSongs } from '../../ui/menus';
import { SelectButton, selectionHeader, SelectionBar, useSelection } from '../../ui/selection';
import { shareSongs } from '../../ui/share';
import { ShareButton } from '../../ui/ShareButton';
import { space, useTheme } from '../../ui/theme';
import { useStore } from '../../ui/useStore';
import { setViewPref, viewPrefs } from '../../ui/viewPrefs';
import { ViewControls } from '../../ui/ViewControls';

const COLUMNS = 2;

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const lib = useLibrary();
  const prefs = useStore(viewPrefs);
  const { width } = useWindowDimensions();
  const isAll = id === ALL_ID;
  const isRecent = id === RECENT_ID;
  const isList = isAll || isRecent;
  const cat = getCategory(id);
  const editable = !isList && id !== UNSORTED_ID;
  // Rows stay where they are while she is here (a play doesn't reorder them); a new sort reorders.
  const shown = useRef<{ sort: string; ids: string[] } | null>(null);
  const songs = useMemo(() => {
    const fresh = sortSongs(songsFor(lib, id), prefs.songSort, lib.plays);
    const out = steadyOrder(fresh, shown.current?.sort === prefs.songSort ? shown.current.ids : null);
    shown.current = { sort: prefs.songSort, ids: out.map((s) => s.id) };
    return out;
  }, [lib, id, prefs.songSort]);
  const playable = songs.filter(canStart);
  const tiles = prefs.songLayout === 'tiles';
  const size = Math.floor((width - space.l * 2 - space.m * (COLUMNS - 1)) / COLUMNS);
  const sel = useSelection();
  const picked = songs.filter((s) => sel.ids.has(s.id));
  const title = isAll ? 'כל השירים' : isRecent ? 'נוספו לאחרונה' : cat.name;
  const mode = (song: (typeof songs)[number]) =>
    sel.active
      ? { select: { selected: sel.ids.has(song.id), onToggle: () => sel.toggle(song.id) } }
      : { menu: { onSelect: () => sel.start(song.id) } };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen
        options={sel.active ? selectionHeader(sel, songs.map((s) => s.id)) : {
          title,
          headerBackVisible: true,
          gestureEnabled: true,
          headerLeft: undefined,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {songs.length > 1 ? <SelectButton onPress={() => sel.start()} /> : null}
              {songs.length ? (
                <ShareButton
                  label={isList ? `שיתוף ${isAll ? 'כל השירים' : 'השירים שנוספו לאחרונה'}` : 'שיתוף הקטגוריה'}
                  onPress={() => shareSongs(title, songs)}
                />
              ) : null}
              {editable ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/category/edit', params: { id } })}
                  accessibilityRole="button"
                  accessibilityLabel="עריכת הקטגוריה"
                  hitSlop={8}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="create-outline" size={24} color={c.primary} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <FlatList
        key={prefs.songLayout}
        data={songs}
        numColumns={tiles ? COLUMNS : 1}
        columnWrapperStyle={tiles ? { gap: space.m } : undefined}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.l, paddingBottom: 24, gap: tiles ? space.m : undefined }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.m }}>
              {!isList ? <CategoryBadge id={cat.id} size={56} /> : null}
              <View style={{ flex: 1 }}>
                <T soft>{songs.length} שירים</T>
              </View>
              {playable.length > 1 && !sel.active ? (
                <Button label="נגני הכול" icon="play" onPress={() => playAll(playable)} />
              ) : null}
            </View>
            {songs.length > 1 && !sel.active ? (
              <ViewControls
                sorts={SONG_SORTS.filter((s) => s.id !== 'manual')}
                sort={prefs.songSort}
                onSort={(songSort) => setViewPref({ songSort })}
                layout={prefs.songLayout}
                onLayout={(songLayout) => setViewPref({ songLayout })}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          tiles ? (
            <SongTile song={item} queue={songs} size={size} {...mode(item)} />
          ) : (
            <SongRow song={item} queue={songs} showCategory={isList} {...mode(item)} />
          )
        }
        ListEmptyComponent={<EmptyState emoji={cat.icon} title="אין כאן שירים עדיין" body="שירים שיסווגו לקטגוריה הזו יופיעו כאן." />}
      />
      {sel.active ? (
        <SelectionBar
          count={picked.length}
          actions={[
            { icon: 'play', label: 'נגני', onPress: () => void playAll(picked.filter(canStart)) },
            { icon: 'list', label: 'לרשימה', onPress: () => addToPlaylist(picked.map((s) => s.id)) },
            { icon: 'share-outline', label: 'שיתוף', onPress: () => void shareSongs(title, picked) },
            { icon: 'trash-outline', label: 'מחיקה', danger: true, onPress: () => confirmDeleteSongs(picked, sel.end) },
          ]}
        />
      ) : (
        <>
          <ActivityDock />
          <MiniPlayer />
        </>
      )}
    </SafeAreaView>
  );
}
