import { router } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { relatedWords } from '../api/ai';
import { connectedProviders } from '../api/keys';
import { getCategory } from '../core/categories';
import { normalize } from '../core/hebrew';
import { matchCategories, pushRecent, searchSongs, SearchHit } from '../core/search';
import { getSetting, setSetting } from '../db/repo';
import { LibraryState } from '../db/useLibrary';
import { diag } from '../diag/log';
import { CategoryBadge, EmptyState, Highlighted, SongRow, T } from '../ui/components';
import { font, radius, space, useTheme } from '../ui/theme';

const RECENT_KEY = 'recentSearches';
/** Ask the AI for related words only when the typed words find fewer songs than this. */
const FEW_HITS = 3;

type Row = { type: 'hit'; hit: SearchHit } | { type: 'header'; text: string };

export function SearchScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [recent, setRecent] = useState<string[]>([]);
  const [related, setRelated] = useState<{ query: string; words: string[] } | null>(null);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    getSetting(RECENT_KEY).then((v) => {
      try {
        setRecent(v ? JSON.parse(v) : []);
      } catch {
        setRecent([]);
      }
    });
  }, []);

  const remember = (q: string) => {
    const next = pushRecent(recent, q);
    if (next === recent) return;
    setRecent(next);
    setSetting(RECENT_KEY, JSON.stringify(next));
  };
  const clearRecent = () => {
    setRecent([]);
    setSetting(RECENT_KEY, '[]');
  };

  const direct = useMemo(() => searchSongs(lib.songs, deferred, lib.usage), [lib.songs, deferred, lib.usage]);
  const cats = useMemo(() => matchCategories(deferred), [deferred]);

  // Few direct results: after she pauses typing, ask the AI service for words related in meaning.
  const directCount = direct.length;
  useEffect(() => {
    const q = deferred.trim();
    setRelated((r) => (r && normalize(r.query) === normalize(q) ? r : null));
    if (q.length < 2 || directCount >= FEW_HITS || !lib.songs.length) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      if (!(await connectedProviders()).length || abort.signal.aborted) return;
      setThinking(true);
      try {
        const words = await relatedWords(q, abort.signal);
        if (!abort.signal.aborted) setRelated({ query: q, words });
      } catch (e) {
        if (!abort.signal.aborted) diag('search.expand.failed', String(e));
      } finally {
        if (!abort.signal.aborted) setThinking(false);
      }
    }, 700);
    return () => {
      abort.abort();
      clearTimeout(timer);
      setThinking(false);
    };
  }, [deferred, directCount, lib.songs.length]);

  const hits = useMemo(
    () =>
      related && related.words.length
        ? searchSongs(lib.songs, deferred, lib.usage, related.words)
        : direct,
    [related, direct, lib.songs, deferred, lib.usage],
  );
  const queue = hits.map((h) => h.song);
  const rows: Row[] = [];
  let headed = false;
  for (const hit of hits) {
    if (hit.related && !headed) {
      rows.push({ type: 'header', text: hits[0].related ? 'שירים בנושא דומה' : 'עוד שירים בנושא דומה' });
      headed = true;
    }
    rows.push({ type: 'hit', hit });
  }

  const typing = deferred.trim().length > 0;

  return (
    <View style={{ flex: 1, padding: space.l }}>
      <T weight="bold" size={28} style={{ marginBottom: space.m }}>חיפוש</T>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => remember(query)}
        placeholder="מילה מהשיר, נושא או שם…"
        placeholderTextColor={c.inkSoft}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        accessibilityLabel="חיפוש שיר"
        style={[styles.input, { backgroundColor: c.surface, borderColor: c.line, color: c.ink, fontFamily: font.regular }]}
      />

      {!typing && recent.length ? (
        <View style={{ marginTop: space.m, gap: space.s }}>
          <View style={styles.recentHead}>
            <T soft size={14}>חיפושים אחרונים</T>
            <Pressable onPress={clearRecent} hitSlop={12} accessibilityRole="button" accessibilityLabel="ניקוי חיפושים אחרונים">
              <T soft size={14}>ניקוי</T>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {recent.map((r) => (
              <Pressable
                key={r}
                onPress={() => setQuery(r)}
                style={[styles.chip, { backgroundColor: c.surfaceAlt }]}
                accessibilityRole="button"
              >
                <T>{r}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {cats.length ? (
        <View style={[styles.chips, { marginTop: space.m }]}>
          {cats.map((id) => (
            <Pressable
              key={id}
              onPress={() => {
                remember(query);
                router.push({ pathname: '/category/[id]', params: { id } });
              }}
              style={[styles.chip, { backgroundColor: getCategory(id).color + '22' }]}
            >
              <CategoryBadge id={id} size={28} />
              <T weight="medium">{getCategory(id).name}</T>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(r) => (r.type === 'hit' ? r.hit.song.id : `h:${r.text}`)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => typing && remember(query)}
        contentContainerStyle={{ paddingTop: space.m, paddingBottom: 40 }}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <T soft weight="medium" size={14} style={styles.header}>✨ {item.text}</T>
          ) : (
            // Opening or playing a result is what makes a search worth remembering.
            <View onTouchStart={() => remember(query)}>
              <SongRow song={item.hit.song} queue={queue} query={item.hit.related ? undefined : deferred} />
              {item.hit.snippet && item.hit.matchedIn !== 'title' ? (
                <Highlighted
                  soft
                  size={13}
                  numberOfLines={1}
                  style={styles.snippet}
                  text={`“${item.hit.snippet}”`}
                  query={item.hit.related ? related?.words.join(' ') : deferred}
                />
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          thinking ? (
            <View style={styles.thinking}>
              <ActivityIndicator color={c.inkSoft} />
              <T soft size={14}>מחפשת שירים בנושא דומה…</T>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          thinking ? undefined : typing ? (
            <EmptyState icon="🔍" title="לא נמצא שיר" body="נסי מילה אחרת מהשיר, או נושא כמו ״גשם״ או ״מנוחה״." />
          ) : recent.length ? undefined : (
            <EmptyState icon="🔎" title="מה מחפשים?" body="אפשר לחפש לפי מילה מתוך השיר, לפי נושא או לפי חג. גם שגיאות כתיב בסדר." />
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
  recentHead: { flexDirection: 'row', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 40,
    paddingVertical: 6, paddingHorizontal: space.m, borderRadius: radius.l,
  },
  snippet: { marginTop: -4, marginBottom: space.s, paddingHorizontal: space.m },
  header: { marginTop: space.m, marginBottom: space.s },
  thinking: { flexDirection: 'row', gap: space.s, alignItems: 'center', justifyContent: 'center', padding: space.l },
});
