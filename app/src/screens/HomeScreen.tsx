import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { importFromPicker, describeSummary } from '../ingest/ingest';
import { onProcessorState } from '../ingest/processor';
import { homeSections, LibraryState } from '../db/useLibrary';
import { Button, EmptyState, SectionTitle, SongRow, T } from '../ui/components';
import { toast } from '../ui/toast';
import { radius, space, useTheme } from '../ui/theme';

function greeting(hour: number) {
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

export function HomeScreen({ lib, goToReview }: { lib: LibraryState; goToReview: () => void }) {
  const c = useTheme();
  const [proc, setProc] = useState({ running: false, serverMissing: false });
  useEffect(() => onProcessorState(setProc), []);

  const sections = homeSections(lib);
  const reviewCount = lib.songs.filter((s) => s.status === 'review').length;
  const pendingCount = lib.songs.filter((s) => s.status === 'pending').length;

  const importFiles = async () => {
    const s = await importFromPicker();
    if (s) toast(describeSummary(s));
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

      {proc.serverMissing && pendingCount > 0 ? (
        <Pressable onPress={() => router.push('/settings')} style={[styles.banner, { backgroundColor: c.surfaceAlt }]}>
          <T weight="medium">{pendingCount} שירים מחכים לעיבוד</T>
          <T soft size={14}>צריך לחבר את שרת העיבוד בהגדרות כדי לתת להם שם וקטגוריה.</T>
        </Pressable>
      ) : null}

      {reviewCount > 0 ? (
        <Pressable
          onPress={goToReview}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: c.primarySoft }]}
        >
          <T weight="bold" size={17}>
            {reviewCount === 1 ? 'שיר חדש מחכה לאישור' : `${reviewCount} שירים חדשים מחכים לאישור`}
          </T>
          <T soft size={14}>דקה אחת של אישור, והם נכנסים לספרייה ›</T>
        </Pressable>
      ) : null}

      {proc.running ? <T soft size={13} style={{ marginTop: space.s }}>מעבד שירים חדשים…</T> : null}

      {sections.map((sec) => (
        <View key={sec.key}>
          <SectionTitle>{sec.title}</SectionTitle>
          {sec.songs.slice(0, 5).map((s) => (
            <SongRow key={s.id} song={s} queue={sec.songs} />
          ))}
        </View>
      ))}

      {!lib.loading && lib.songs.length === 0 ? (
        <EmptyState
          icon="🎶"
          title="הספרייה עוד ריקה"
          body={'בוואטסאפ: לחיצה ארוכה על הקלטה או שיר ← שיתוף ← שירון.\nאפשר לבחור כמה הקלטות יחד.\nהשירים יקבלו שם וקטגוריה לבד.'}
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
  banner: { padding: space.l, borderRadius: radius.m, marginTop: space.m, gap: 4 },
});
