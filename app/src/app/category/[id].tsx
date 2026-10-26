import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategory } from '../../core/categories';
import { rankSongs } from '../../core/ranking';
import { rankedCategory, useLibrary } from '../../db/useLibrary';
import { playSong } from '../../player/player';
import { Button, CategoryBadge, EmptyState, SongRow, T } from '../../ui/components';
import { MiniPlayer } from '../../ui/MiniPlayer';
import { space } from '../../ui/theme';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lib = useLibrary();
  const isAll = id === 'all';
  const cat = getCategory(id);

  const songs = isAll
    ? rankSongs(
        lib.songs.filter((s) => s.status !== 'review').map((s) => ({ song: s, events: lib.plays.get(s.id) ?? [], seasonal: false })),
        Date.now(),
      ).map((r) => lib.byId.get(r.id)!)
    : rankedCategory(lib, id);
  const playable = songs.filter((s) => s.kind === 'audio' && s.playableUri);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title: isAll ? 'כל השירים' : cat.name }} />
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.l, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l }}>
            {!isAll ? <CategoryBadge id={cat.id} size={56} /> : null}
            <View style={{ flex: 1 }}>
              <T soft>{songs.length} שירים · השירים הנפוצים למעלה</T>
            </View>
            {playable.length > 1 ? (
              <Button label="נגני הכול" icon="▶︎" onPress={() => playSong(playable[0], playable)} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <SongRow song={item} queue={songs} showCategory={isAll} />}
        ListEmptyComponent={<EmptyState icon={cat.icon} title="אין כאן שירים עדיין" body="שירים שיסווגו לקטגוריה הזו יופיעו כאן." />}
      />
      <MiniPlayer />
    </SafeAreaView>
  );
}
