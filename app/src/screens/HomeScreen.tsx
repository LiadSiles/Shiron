import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { importFromPicker } from '../ingest/ingest';
import { onProcessorState, ProcessorState } from '../ingest/processor';
import { homeSections, LibraryState } from '../db/useLibrary';
import { Button, EmptyState, SectionTitle, SongRow, T } from '../ui/components';
import { toast } from '../ui/toast';
import { radius, space, useTheme } from '../ui/theme';

function greeting(hour: number) {
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

export function HomeScreen({ lib }: { lib: LibraryState }) {
  const c = useTheme();
  const [proc, setProc] = useState<ProcessorState | null>(null);
  useEffect(() => onProcessorState(setProc), []);

  // Not on every processor tick: ranking every category runs the Hebrew calendar per song.
  const sections = useMemo(() => homeSections(lib), [lib]);
  const pendingCount = lib.songs.filter((s) => s.status === 'pending').length;

  const importFiles = async () => {
    const message = await importFromPicker();
    if (message) toast(message);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T soft size={15}>{greeting(new Date().getHours())}</T>
          <T weight="bold" size={30}>שירון</T>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityLabel="הגדרות"
          hitSlop={12}
          style={[styles.gear, { backgroundColor: c.surfaceAlt }]}
        >
          <T size={20}>⚙︎</T>
        </Pressable>
      </View>

      {proc?.needsKey && pendingCount > 0 ? (
        <Pressable
          onPress={() => router.push('/connect')}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: c.surfaceAlt }]}
        >
          <T weight="medium">
            {pendingCount === 1 ? 'שיר אחד מחכה לשם ולקטגוריה' : `${pendingCount} שירים מחכים לשם ולקטגוריה`}
          </T>
          <T soft size={14}>חיבור חד-פעמי לשירות AI חינמי, כשתי דקות ›</T>
        </Pressable>
      ) : null}

      {proc?.notice && !proc.needsKey && pendingCount > 0 ? (
        <T soft size={13} style={{ marginTop: space.s }}>{proc.notice}</T>
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
                <T weight="medium" style={{ color: c.primary, marginTop: space.xl }}>הכול ›</T>
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
          icon="🎶"
          title="הספרייה עוד ריקה"
          body={'בוואטסאפ: לחיצה ארוכה על הקלטה, שיר או סרטון ← שיתוף ← Shiron.\nאפשר לבחור כמה יחד.\nהשירים יקבלו שם וקטגוריה לבד.'}
        >
          <Button label="ייבוא מתיקיית קבצים" kind="quiet" icon="📁" onPress={importFiles} />
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.s },
  gear: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  banner: { padding: space.l, borderRadius: radius.m, marginTop: space.m, gap: 4 },
});
