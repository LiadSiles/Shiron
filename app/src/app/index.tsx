import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../db/useLibrary';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { T } from '../ui/components';
import { MiniPlayer } from '../ui/MiniPlayer';
import { space, useTheme } from '../ui/theme';

type Tab = 'home' | 'library' | 'search' | 'review';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'בית', icon: '🏠' },
  { key: 'library', label: 'ספרייה', icon: '📚' },
  { key: 'search', label: 'חיפוש', icon: '🔍' },
  { key: 'review', label: 'לבדיקה', icon: '✅' },
];

/**
 * Four tabs with a mini player above them on every tab (see the screen map in the design doc).
 * Tabs are rendered here rather than with a tab navigator so the mini player and the
 * RTL tab order stay fully under our control.
 */
export default function Shell() {
  const c = useTheme();
  const lib = useLibrary();
  const [tab, setTab] = useState<Tab>('home');
  const reviewCount = lib.songs.filter((s) => s.status === 'review' || s.status === 'failed').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeScreen lib={lib} goToReview={() => setTab('review')} />}
        {tab === 'library' && <LibraryScreen lib={lib} />}
        {tab === 'search' && <SearchScreen lib={lib} />}
        {tab === 'review' && <ReviewScreen lib={lib} />}
      </View>
      <MiniPlayer />
      <SafeAreaView edges={['bottom']} style={[styles.bar, { backgroundColor: c.surface, borderColor: c.line }]}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              style={styles.tab}
            >
              <View>
                <Text style={{ fontSize: 22, opacity: active ? 1 : 0.55 }}>{t.icon}</Text>
                {t.key === 'review' && reviewCount > 0 ? (
                  <View style={[styles.dot, { backgroundColor: c.primary }]}>
                    <Text style={{ color: c.primaryInk, fontSize: 11, fontWeight: '700' }}>{reviewCount}</Text>
                  </View>
                ) : null}
              </View>
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
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.xs },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 2 },
  dot: {
    position: 'absolute',
    top: -4,
    end: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
