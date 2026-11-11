import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { processorStore } from '../ingest/processor';
import { homeSections, LibraryState } from '../core/library';
import { WorkStatus } from '../ui/ActivityBanner';
import { Button, EmptyState, SectionTitle, SongRow, T } from '../ui/components';
import { Icon } from '../ui/Icon';
import { PlaylistStrip } from '../ui/playlists';
import { pickAndImport } from '../ui/importResult';
import { radius, space, useTheme } from '../ui/theme';
import { useStore } from '../ui/useStore';

function greeting(hour: number) {
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

export function HomeScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const proc = useStore(processorStore);

  // Not on every processor tick: ranking every category runs the Hebrew calendar per song.
  const sections = useMemo(() => homeSections(lib), [lib]);
  const pendingCount = lib.songs.filter((s) => s.status === 'pending').length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T soft size={15}>{greeting(new Date().getHours())}</T>
          <T weight="bold" size={30}>PlayGan</T>
        </View>
        {/* Always here, not only on the empty library: adding from Files is how songs come in
            when sharing can't (an iPhone install without App Groups) or for files on the phone. */}
        <Pressable
          onPress={pickAndImport}
          accessibilityRole="button"
          accessibilityLabel="הוספת שירים מהקבצים"
          hitSlop={4}
          style={({ pressed }) => [styles.add, { backgroundColor: c.primarySoft, opacity: pressed ? 0.8 : 1 }]}
        >
          {/* A word next to the "+": on its own it didn't say what it adds. */}
          <Icon name="add" size={24} color={c.primary} />
          <T weight="medium" style={{ color: c.primary }}>הוספה</T>
        </Pressable>
      </View>

      <WorkStatus />

      {proc?.needsKey && pendingCount > 0 ? (
        <Pressable
          onPress={() => router.push('/connect')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.banner, { backgroundColor: c.primarySoft, borderColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.bannerIcon, { backgroundColor: c.primary }]}>
            <Icon name="sparkles" size={22} color={c.primaryInk} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="bold">
              {pendingCount === 1 ? 'שיר אחד מחכה לשם ולקטגוריה' : `${pendingCount} שירים מחכים לשם ולקטגוריה`}
            </T>
            {/* A key that stopped working says so; otherwise the first-time offer. */}
            <T soft size={14}>{proc.notice ?? 'חיבור חד-פעמי לשירות AI חינמי, כשתי דקות'}</T>
          </View>
          <Icon name="chevron-back" size={20} color={c.primary} />
        </Pressable>
      ) : null}

      {proc?.notice && !proc.needsKey && pendingCount > 0 ? (
        <T soft size={13} style={{ marginTop: space.s }}>{proc.notice}</T>
      ) : null}

      {lib.playlists.length ? (
        <View>
          <SectionTitle>הרשימות שלי</SectionTitle>
          <PlaylistStrip playlists={lib.playlists} byId={lib.byId} />
        </View>
      ) : null}

      {sections.map((sec) => (
        <View key={sec.key}>
          <View style={styles.sectionHead}>
            <SectionTitle>{sec.title}</SectionTitle>
            {sec.categoryId && sec.songs.length > 5 ? (
              <Pressable
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: sec.categoryId! } })}
                hitSlop={12}
                accessibilityRole="link"
              >
                <View style={styles.all}>
                  <T weight="medium" style={{ color: c.primary }}>הכול</T>
                  <Icon name="chevron-back" size={16} color={c.primary} />
                </View>
              </Pressable>
            ) : null}
          </View>
          {sec.songs.slice(0, 5).map((s) => (
            <SongRow key={s.id} song={s} queue={sec.songs} />
          ))}
        </View>
      ))}

      {!lib.loading && lib.songs.length === 0 ? (
        <EmptyState
          icon="musical-notes"
          title="הספרייה עוד ריקה"
          body={'בוואטסאפ: לחיצה ארוכה על הקלטה, שיר או סרטון ← שיתוף ← PlayGan.\nאפשר לבחור כמה יחד.\nהשירים יקבלו שם וקטגוריה לבד.'}
        >
          <Button label="ייבוא מתיקיית קבצים" kind="quiet" icon="folder-open-outline" onPress={pickAndImport} />
        </EmptyState>
      ) : null}

      {!lib.loading && lib.songs.length > 0 && sections.length === 0 ? (
        <T soft style={{ marginTop: space.xl }}>
          השירים שתנגני יופיעו כאן, יחד עם הצעות לפי השעה והחג.
        </T>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, paddingBottom: 40 },
  header: { marginBottom: space.s, flexDirection: 'row', alignItems: 'center', gap: space.m },
  add: { height: 48, borderRadius: 24, paddingStart: space.m, paddingEnd: space.l, flexDirection: 'row', gap: space.xs, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  all: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, marginBottom: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderRadius: radius.m, borderWidth: 1, marginTop: space.m },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
