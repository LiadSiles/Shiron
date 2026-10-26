import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { getGroqKey, onGroqKeyChange, removeGroqKey } from '../api/groq';
import { describeSummary, importFromPicker } from '../ingest/ingest';
import { onProcessorState, ProcessorState } from '../ingest/processor';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { radius, space, useTheme } from '../ui/theme';

export default function SettingsScreen() {
  const c = useTheme();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [proc, setProc] = useState<ProcessorState | null>(null);

  useEffect(() => {
    getGroqKey().then((k) => setConnected(!!k));
    const off = onGroqKeyChange(setConnected);
    const offProc = onProcessorState(setProc);
    return () => {
      off();
      offProc();
    };
  }, []);

  const disconnect = () =>
    Alert.alert('לנתק את Groq?', 'שירים חדשים יישמרו ויתנגנו, אבל לא יקבלו שם וקטגוריה עד החיבור הבא.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'ניתוק', style: 'destructive', onPress: () => removeGroqKey() },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, paddingBottom: 60 }}>
      <T weight="bold" size={18}>שם וקטגוריה אוטומטיים</T>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        <T weight="medium">
          {connected === null ? '…' : connected ? 'Groq מחובר ✓' : 'Groq לא מחובר'}
        </T>
        <T soft size={14} style={{ lineHeight: 20 }}>
          Groq הוא שירות AI חינמי שמתמלל את ההקלטות ומציע לכל שיר שם, מילים וקטגוריה. לחשבון החינמי יש מכסה
          יומית; אם היא נגמרת, השירים ממתינים וממשיכים אוטומטית אחר כך.
        </T>
        {proc?.notice ? <T size={14} style={{ color: c.warn }}>{proc.notice}</T> : null}
        <Button
          label={connected ? 'חיבור מפתח אחר' : 'חיבור Groq'}
          kind={connected ? 'quiet' : 'primary'}
          onPress={() => router.push('/connect')}
        />
        {connected ? <Button label="ניתוק" kind="quiet" onPress={disconnect} /> : null}
      </View>

      <T weight="bold" size={18} style={{ marginTop: space.l }}>ייבוא שירים</T>
      <T soft style={{ lineHeight: 22 }}>
        הדרך הקלה: בוואטסאפ, לחיצה ארוכה על הקלטה או סרטון ← שיתוף ← Shiron. אפשר גם לבחור קבצים מאפליקציית הקבצים.
      </T>
      <Button
        label="בחירת קבצי שמע או וידאו"
        icon="📁"
        kind="quiet"
        onPress={async () => {
          const s = await importFromPicker();
          if (s) toast(describeSummary(s));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, gap: space.m },
});
