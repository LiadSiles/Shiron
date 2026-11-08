import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategory, primaryCategoryId } from '../../core/categories';
import { textOn } from '../../core/color';
import { canStart } from '../../core/ingestRules';
import { cleanName, moveSong, playlistSongs, songCount } from '../../core/playlists';
import { SONG_SORTS, sortSongs, steadyOrder } from '../../core/sorting';
import type { SongWithCategories } from '../../core/types';
import { deletePlaylist, renamePlaylist, setPlaylistSongs } from '../../db/repo';
import { useLibrary } from '../../db/useLibrary';
import { Button, CategoryBadge, EmptyState, playAll, SongRow, SongTile, T } from '../../ui/components';
import { Icon, IconName } from '../../ui/Icon';
import { MiniPlayer } from '../../ui/MiniPlayer';
import { shareSongs } from '../../ui/share';
import { ShareButton } from '../../ui/ShareButton';
import { playlistColor } from '../../ui/playlists';
import { font, radius, space, TOUCH, useTheme } from '../../ui/theme';
import { useStore } from '../../ui/useStore';
import { setViewPref, viewPrefs } from '../../ui/viewPrefs';
import { ViewControls } from '../../ui/ViewControls';

const COLUMNS = 2;

/**
 * One of her lists. Normally: tap a song to play from there, "נגני הכול" to play it all in her
 * order. "סידור" switches to arranging: arrows move a song, ✕ takes it out (the song stays in
 * the library). Arrows rather than drag-and-drop: big targets, no precise gestures, works the
 * same on both platforms without another library. She can also see it sorted another way (by
 * name, plays…) and in tiles; "שמירה כסדר הרשימה" makes that order hers.
 */
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const lib = useLibrary();
  const list = lib.playlists.find((p) => p.id === id);
  const [arranging, setArranging] = useState(false);
  const [name, setName] = useState(list?.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const prefs = useStore(viewPrefs);
  const { width } = useWindowDimensions();

  // Rows stay where they are while she is here (core/sorting steadyOrder); her own order is live.
  const shown = useRef<{ sort: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (list && !editingName) setName(list.name);
  }, [list?.name, editingName]);

  if (!list) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <Stack.Screen options={{ title: '' }} />
        {lib.loading ? null : <EmptyState icon="list" title="הרשימה לא נמצאה" body="אולי היא נמחקה." />}
      </SafeAreaView>
    );
  }

  const ordered = playlistSongs(list.songIds, lib.byId);
  const sort = arranging ? 'manual' : prefs.playlistSort;
  const sorted = sortSongs(ordered, sort, lib.plays);
  const songs = sort === 'manual' ? sorted : steadyOrder(sorted, shown.current?.sort === sort ? shown.current.ids : null);
  shown.current = { sort, ids: songs.map((s) => s.id) };
  const playable = songs.filter(canStart);
  const tiles = !arranging && prefs.songLayout === 'tiles';
  const size = Math.floor((width - space.l * 2 - space.m * (COLUMNS - 1)) / COLUMNS);
  const color = playlistColor(list.id);
  const ink = textOn(color);

  const saveName = () => {
    setEditingName(false);
    const clean = cleanName(name);
    if (clean && clean !== list.name) void renamePlaylist(list.id, clean);
    else setName(list.name);
  };

  const move = (from: number, to: number) => setPlaylistSongs(list.id, moveSong(ordered.map((s) => s.id), from, to));
  const remove = (songId: string) => setPlaylistSongs(list.id, ordered.map((s) => s.id).filter((x) => x !== songId));
  const keepOrder = async () => {
    await setPlaylistSongs(list.id, songs.map((s) => s.id));
    setViewPref({ playlistSort: 'manual' });
  };

  const confirmDelete = () =>
    Alert.alert('למחוק את הרשימה?', `"${list.name}" תימחק. השירים עצמם נשארים בספרייה.`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: async () => {
          await deletePlaylist(list.id);
          router.back();
        },
      },
    ]);

  const addSongs = () => router.push({ pathname: '/playlist/pick', params: { id: list.id } });

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerRow}>
              {songs.length && !arranging ? <ShareButton label="שיתוף הרשימה" onPress={() => shareSongs(list.name, songs)} /> : null}
              {songs.length > 1 ? (
                <Pressable onPress={() => setArranging((a) => !a)} hitSlop={12} accessibilityRole="button" accessibilityLabel={arranging ? 'סיום הסידור' : 'סידור הרשימה'} style={styles.headerBtn}>
                  <Icon name={arranging ? 'checkmark' : 'swap-vertical'} size={20} color={c.primary} />
                  <T weight="medium" style={{ color: c.primary }}>{arranging ? 'סיום' : 'סידור'}</T>
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <FlatList
        key={tiles ? 'tiles' : 'rows'}
        data={songs}
        numColumns={tiles ? COLUMNS : 1}
        columnWrapperStyle={tiles ? { gap: space.m } : undefined}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.l, paddingBottom: 24, gap: tiles ? space.m : undefined }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: space.l }}>
            <View style={[styles.hero, { backgroundColor: color }]}>
              <Icon name="list" size={28} color={ink} />
              {editingName ? (
                <TextInput
                  value={name}
                  onChangeText={setName}
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  autoFocus
                  returnKeyType="done"
                  maxLength={40}
                  accessibilityLabel="שם הרשימה"
                  style={[styles.nameInput, { color: ink, borderColor: ink, fontFamily: font.bold }]}
                />
              ) : (
                <Pressable
                  onPress={() => setEditingName(true)}
                  accessibilityRole="button"
                  accessibilityLabel={list.name}
                  accessibilityHint="שינוי שם הרשימה"
                  style={styles.nameRow}
                >
                  <T weight="bold" size={26} numberOfLines={2} style={{ color: ink, flexShrink: 1 }}>{list.name}</T>
                  <Icon name="pencil" size={18} color={ink} />
                </Pressable>
              )}
              <T style={{ color: ink, opacity: 0.85 }}>{songCount(songs.length)}</T>
            </View>
            <View style={styles.actions}>
              {playable.length ? (
                <Button label="נגני הכול" icon="play" onPress={() => playAll(playable)} style={{ flex: 1 }} />
              ) : null}
              <Button label="הוספת שירים" icon="add" kind="quiet" onPress={addSongs} style={{ flex: 1 }} />
            </View>
            {arranging ? <T soft size={14} style={{ marginTop: space.m }}>החצים מזיזים שיר למעלה או למטה. ✕ מוציא אותו מהרשימה (הוא נשאר בספרייה).</T> : null}
            {!arranging && songs.length > 1 ? (
              <View style={{ marginTop: space.l }}>
                <ViewControls
                  sorts={SONG_SORTS.filter((s) => s.id !== 'smart')}
                  sort={prefs.playlistSort}
                  onSort={(playlistSort) => setViewPref({ playlistSort })}
                  layout={prefs.songLayout}
                  onLayout={(songLayout) => setViewPref({ songLayout })}
                />
                {prefs.playlistSort !== 'manual' && prefs.playlistSort !== 'smart' ? (
                  <Pressable onPress={keepOrder} accessibilityRole="button" style={styles.keep} hitSlop={8}>
                    <Icon name="checkmark-done" size={18} color={c.primary} />
                    <T weight="medium" size={14} style={{ color: c.primary }}>שמירה כסדר הרשימה</T>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) =>
          arranging ? (
            <ArrangeRow
              song={item}
              first={index === 0}
              last={index === songs.length - 1}
              onUp={() => move(index, index - 1)}
              onDown={() => move(index, index + 1)}
              onRemove={() => remove(item.id)}
            />
          ) : tiles ? (
            <SongTile song={item} queue={songs} size={size} />
          ) : (
            <SongRow song={item} queue={songs} />
          )
        }
        ListEmptyComponent={
          <EmptyState icon="list" title="הרשימה עוד ריקה" body="בחרי שירים מהספרייה, והם יתנגנו כאן לפי הסדר שלך.">
            <Button label="הוספת שירים" icon="add" onPress={addSongs} />
          </EmptyState>
        }
        ListFooterComponent={
          <Pressable onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="מחיקת הרשימה" style={styles.delete}>
            <Icon name="trash-outline" size={18} color={c.bad} />
            <T weight="medium" style={{ color: c.bad }}>מחיקת הרשימה</T>
          </Pressable>
        }
      />
      <MiniPlayer />
    </SafeAreaView>
  );
}

function ArrangeRow({ song, first, last, onUp, onDown, onRemove }: {
  song: SongWithCategories;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const c = useTheme();
  const catId = primaryCategoryId(song);
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
      <CategoryBadge id={catId} size={36} />
      <View style={{ flex: 1 }}>
        <T weight="medium" numberOfLines={1}>{song.title}</T>
        <T soft size={13} numberOfLines={1}>{getCategory(catId).name}</T>
      </View>
      <RoundButton icon="arrow-up" label={`להזיז את ${song.title} למעלה`} disabled={first} onPress={onUp} />
      <RoundButton icon="arrow-down" label={`להזיז את ${song.title} למטה`} disabled={last} onPress={onDown} />
      <RoundButton icon="close" label={`להוציא את ${song.title} מהרשימה`} onPress={onRemove} danger />
    </View>
  );
}

function RoundButton({ icon, label, onPress, disabled, danger }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: danger ? c.bad + '1F' : c.surfaceAlt, opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
      ]}
    >
      <Icon name={icon} size={22} color={danger ? c.bad : c.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keep: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40, alignSelf: 'flex-start' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: TOUCH, paddingHorizontal: space.s },
  hero: { borderRadius: radius.l, padding: space.l, gap: space.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: TOUCH },
  nameInput: { fontSize: 24, borderBottomWidth: 2, paddingVertical: space.xs, minHeight: TOUCH },
  actions: { flexDirection: 'row', gap: space.m, marginTop: space.l },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    padding: space.s,
    paddingStart: space.m,
    minHeight: 64,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.s,
  },
  round: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, minHeight: TOUCH, marginTop: space.xxl },
});
