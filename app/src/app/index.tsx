import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, StyleSheet, TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../db/useLibrary';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { SearchResults } from '../screens/SearchResults';
import { T } from '../ui/components';
import { Icon, IconName } from '../ui/Icon';
import { appReady } from '../ui/launch';
import { MiniPlayer } from '../ui/MiniPlayer';
import { SearchField } from '../ui/SearchField';
import { radius, space, TOUCH, useTheme } from '../ui/theme';

type Tab = 'home' | 'library';

const TABS: { key: Tab; label: string; icon: IconName; active: IconName }[] = [
  { key: 'home', label: 'בית', icon: 'home-outline', active: 'home' },
  { key: 'library', label: 'ספרייה', icon: 'library-outline', active: 'library' },
];

/**
 * The shell: a search bar at the top of every tab, the tab's content, the mini player and the
 * tab bar. While she searches (field focused or text typed) the results replace the tab's
 * content; clearing the field, "ביטול" or the Android back button return to it.
 * Tabs are rendered here rather than with a tab navigator so the search bar, the mini player
 * and the RTL tab order stay fully under our control.
 */
export default function Shell() {
  const c = useTheme();
  const lib = useLibrary();
  const [tab, setTab] = useState<Tab>('home');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitted, setSubmitted] = useState(0);
  const input = useRef<TextInputInstance>(null);
  const searching = focused || query.trim().length > 0;

  // First frame with her songs in it: the splash fades straight into it.
  useEffect(() => {
    if (!lib.loading) appReady();
  }, [lib.loading]);

  const endSearch = () => {
    setQuery('');
    setFocused(false);
    input.current?.blur();
    Keyboard.dismiss();
  };

  useEffect(() => {
    if (!searching) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      endSearch();
      return true;
    });
    return () => sub.remove();
  }, [searching]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={styles.searchRow}>
        <SearchField
          inputRef={input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => setSubmitted((n) => n + 1)}
          placeholder="חיפוש: מילה מהשיר, נושא או שם"
          label="חיפוש שיר"
        />
        {searching ? (
          <Pressable onPress={endSearch} hitSlop={8} accessibilityRole="button" style={styles.cancel}>
            <T weight="medium" style={{ color: c.primary }}>ביטול</T>
          </Pressable>
        ) : (
          // Settings sit in the same spot on every tab, next to search.
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="הגדרות"
            style={({ pressed }) => [styles.gear, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.line }]}
          >
            <Icon name="settings-outline" size={22} color={c.ink} />
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }}>
        {searching ? (
          <SearchResults lib={lib} query={query} setQuery={setQuery} submitted={submitted} />
        ) : tab === 'home' ? (
          <HomeScreen lib={lib} />
        ) : (
          <LibraryScreen lib={lib} />
        )}
      </View>
      <MiniPlayer />
      <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: c.surface, borderColor: c.line }]}>
        {TABS.map((t) => {
          const active = t.key === tab && !searching;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                if (searching) endSearch();
                setTab(t.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              style={styles.tab}
            >
              <Icon name={active ? t.active : t.icon} size={26} color={active ? c.primary : c.inkSoft} />
              <T size={12} weight={active ? 'bold' : 'regular'} style={{ color: active ? c.primary : c.inkSoft }}>
                {t.label}
              </T>
            </Pressable>
          );
        })}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.l, paddingTop: space.s, paddingBottom: space.xs },
  cancel: { minHeight: TOUCH, justifyContent: 'center' },
  gear: { width: TOUCH, height: TOUCH, borderRadius: radius.m, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 2 },
});
