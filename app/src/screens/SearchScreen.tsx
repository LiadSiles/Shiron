import { router } from 'expo-router';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { getCategory } from '../core/categories';
import { matchCategories, searchSongs } from '../core/search';
import { LibraryState } from '../db/useLibrary';
import { CategoryBadge, EmptyState, SongRow, T } from '../ui/components';
import { font, radius, space, useTheme } from '../ui/theme';

export function SearchScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const searchable = useMemo(() => lib.songs.filter((s) => s.status !== 'review'), [lib.songs]);
  const hits = useMemo(() => searchSongs(searchable, deferred, lib.usage), [searchable, deferred, lib.usage]);
  const cats = useMemo(() => matchCategories(deferred), [deferred]);
  const queue = hits.map((h) => h.song);

  return (
    <View style={{ flex: 1, padding: space.l }}>
      <T weight="bold" size={28} style={{ marginBottom: space.m }}>חיפוש</T>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="מילה מהשיר, נושא או שם…"
        placeholderTextColor={c.inkSoft}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        accessibilityLabel="חיפוש שיר"
        style={[styles.input, { backgroundColor: c.surface, borderColor: c.line, color: c.ink, fontFamily: font.regular }]}
      />

      {cats.length ? (
        <View style={styles.chips}>
          {cats.map((id) => (
            <Pressable
              key={id}
              onPress={() => router.push({ pathname: '/category/[id]', params: { id } })}
              style={[styles.chip, { backgroundColor: getCategory(id).color + '22' }]}
            >
              <CategoryBadge id={id} size={28} />
              <T weight="medium">{getCategory(id).name}</T>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={hits}
        keyExtractor={(h) => h.song.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: space.m, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View>
            <SongRow song={item.song} queue={queue} />
            {item.snippet && item.matchedIn !== 'title' ? (
              <T soft size={13} numberOfLines={1} style={styles.snippet}>“{item.snippet}”</T>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          deferred.trim() ? (
            <EmptyState icon="🔍" title="לא נמצא שיר" body="נסי מילה אחרת מהשיר, או נושא כמו ״גשם״ או ״מנוחה״." />
          ) : (
            <EmptyState icon="🔎" title="מה מחפשים?" body="אפשר לחפש לפי מילה מתוך השיר, לפי נושא או לפי חג." />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderRadius: radius.m,
    borderWidth: 1,
    paddingHorizontal: space.l,
    fontSize: 18,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: 6, paddingHorizontal: space.m, borderRadius: radius.l },
  snippet: { marginTop: -4, marginBottom: space.s, paddingHorizontal: space.m },
});
