import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategory } from '../../core/categories';
import { cleanName, newPlaylistName, songCount, toggleSong } from '../../core/playlists';
import { searchSongs } from '../../core/search';
import { createPlaylist, setPlaylistSongs } from '../../db/repo';
import { ALL_ID, songsFor, useLibrary } from '../../db/useLibrary';
import { diag } from '../../diag/log';
import { Button, CategoryBadge, T } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { toast } from '../../ui/toast';
import { font, radius, space, TOUCH, useTheme } from '../../ui/theme';

/**
 * Choosing songs for a list — a new one (no `id`: name it here too) or an existing one (its
 * songs come checked; unchecking takes a song out). Songs she checks go to the end of the list
 * in the order she checks them. The library is shown most-used first, with a search field.
 */
export default function PickSongs() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const c = useTheme();
  const lib = useLibrary();
  const existing = id ? lib.playlists.find((p) => p.id === id) : undefined;

  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const deferred = useDeferredValue(query);

  // An existing list's songs arrive with the library; until she touches anything, they are the selection.
  const selected = chosen ?? existing?.songIds ?? [];
  const all = useMemo(() => songsFor(lib, ALL_ID), [lib]);
  const shown = useMemo(
    () => (deferred.trim() ? searchSongs(lib.songs, deferred, lib.usage).map((h) => h.song) : all),
    [deferred, all, lib],
  );

  const save = async () => {
    setSaving(true);
    try {
      if (existing) {
        await setPlaylistSongs(existing.id, selected);
        router.back();
      } else {
        const finalName = cleanName(name) || newPlaylistName(lib.playlists.map((p) => p.name));
        const newId = await createPlaylist(finalName, selected);
        toast(`הרשימה "${finalName}" נשמרה`, 'success');
        router.replace({ pathname: '/playlist/[id]', params: { id: newId } });
      }
    } catch (e) {
      diag('playlist save failed', e);
      toast('לא הצלחנו לשמור את הרשימה', 'error');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? existing.name : 'רשימה חדשה' }} />
      <View style={styles.top}>
        {!id ? (
          <>
            <T soft size={13}>שם הרשימה</T>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="למשל: מעגל בוקר"
              placeholderTextColor={c.inkSoft}
              maxLength={40}
              returnKeyType="done"
              accessibilityLabel="שם הרשימה"
              style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.bold, fontSize: 20 }]}
            />
          </>
        ) : null}
        <View style={[styles.search, { borderColor: c.line, backgroundColor: c.surface }]}>
          <Icon name="search" size={20} color={c.inkSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש שיר להוספה"
            placeholderTextColor={c.inkSoft}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="חיפוש שיר להוספה"
            style={{ flex: 1, color: c.ink, fontFamily: font.regular, fontSize: 17, paddingVertical: space.s }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="ניקוי החיפוש">
              <Icon name="close-circle" size={22} color={c.inkSoft} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.l }}
        renderItem={({ item }) => {
          const pos = selected.indexOf(item.id);
          const on = pos >= 0;
          const catId = item.categories[0]?.categoryId ?? 'unsorted';
          return (
            <Pressable
              onPress={() => setChosen(toggleSong(selected, item.id))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.title}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: on ? c.primarySoft : pressed ? c.surfaceAlt : c.surface, borderColor: on ? c.primary : c.line },
              ]}
            >
              <CategoryBadge id={catId} size={40} />
              <View style={{ flex: 1 }}>
                <T weight="medium" size={17} numberOfLines={1}>{item.title}</T>
                <T soft size={13} numberOfLines={1}>{getCategory(catId).name}</T>
              </View>
              <View style={[styles.check, { backgroundColor: on ? c.primary : 'transparent', borderColor: on ? c.primary : c.inkSoft }]}>
                {on ? <T weight="bold" size={14} style={{ color: c.primaryInk }}>{pos + 1}</T> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <T soft style={{ textAlign: 'center', marginTop: space.xl }}>
            {lib.songs.length ? 'לא נמצאו שירים' : 'אין עדיין שירים בספרייה'}
          </T>
        }
      />

      <View style={[styles.bottom, { borderColor: c.line, backgroundColor: c.surface }]}>
        <T soft style={{ flex: 1 }}>{selected.length ? `נבחרו ${songCount(selected.length)}` : 'הקישי על שירים כדי לבחור'}</T>
        <Button label={existing ? 'שמירה' : 'יצירת הרשימה'} icon="checkmark" onPress={save} disabled={saving} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { padding: space.l, paddingBottom: space.s, gap: space.s },
  input: { minHeight: TOUCH, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, marginBottom: space.s },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: space.m,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    minHeight: 64,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: space.s,
  },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
