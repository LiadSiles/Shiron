import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCategory } from '../../core/categories';
import { canStart } from '../../core/ingestRules';
import { ALL_ID, RECENT_ID, songsFor, useLibrary } from '../../db/useLibrary';
import { Button, CategoryBadge, EmptyState, playAll, SongRow, T } from '../../ui/components';
import { MiniPlayer } from '../../ui/MiniPlayer';
import { space } from '../../ui/theme';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lib = useLibrary();
  const isAll = id === ALL_ID;
  const isRecent = id === RECENT_ID;
  const isList = isAll || isRecent;
  const cat = getCategory(id);
  const songs = songsFor(lib, id);
  const playable = songs.filter(canStart);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Stack.Screen options={{ title: isAll ? 'כל השירים' : isRecent ? 'נוספו לאחרונה' : cat.name }} />
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: space.l, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l }}>
            {!isList ? <CategoryBadge id={cat.id} size={56} /> : null}
            <View style={{ flex: 1 }}>
              <T soft>{songs.length} שירים · {isRecent ? 'החדשים למעלה' : 'השירים הנפוצים למעלה'}</T>
            </View>
            {playable.length > 1 ? (
              <Button label="נגני הכול" icon="play" onPress={() => playAll(playable)} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <SongRow song={item} queue={songs} showCategory={isList} />}
        ListEmptyComponent={<EmptyState emoji={cat.icon} title="אין כאן שירים עדיין" body="שירים שיסווגו לקטגוריה הזו יופיעו כאן." />}
      />
      <MiniPlayer />
    </SafeAreaView>
  );
}
