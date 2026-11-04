import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { connectedProviders, getPreferred, onKeysChange, removeKey, setPreferred } from '../api/keys';
import { PROVIDER_IDS, PROVIDERS, ProviderId } from '../core/ai';
import { importFromPicker } from '../ingest/ingest';
import { onProcessorState, ProcessorState } from '../ingest/processor';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { radius, space, useTheme } from '../ui/theme';

export default function SettingsScreen() {
  const c = useTheme();
  const [connected, setConnected] = useState<ProviderId[] | null>(null);
  const [preferred, setPreferredState] = useState<ProviderId>('groq');
  const [proc, setProc] = useState<ProcessorState | null>(null);

  useEffect(() => {
    const load = () => {
      connectedProviders().then(setConnected);
      getPreferred().then(setPreferredState);
    };
    load();
    const off = onKeysChange(load);
    const offProc = onProcessorState(setProc);
    return () => {
      off();
      offProc();
    };
  }, []);

  const disconnect = (p: ProviderId) =>
    Alert.alert(`לנתק את ${PROVIDERS[p].name}?`, 'שירים חדשים יישמרו ויתנגנו. אם אין שירות מחובר אחר, הם לא יקבלו שם וקטגוריה עד החיבור הבא.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'ניתוק', style: 'destructive', onPress: () => removeKey(p) },
    ]);

  const both = (connected?.length ?? 0) > 1;

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, paddingBottom: 60 }}>
      <T weight="bold" size={18}>שם וקטגוריה אוטומטיים</T>
      <T soft size={14} style={{ lineHeight: 20 }}>
        שירות AI חינמי מתמלל את ההקלטות ומציע לכל שיר שם, מילים וקטגוריה. לכל שירות יש מכסה יומית; כששני שירותים
        מחוברים, כשהמכסה של אחד נגמרת השני ממשיך.
      </T>
      {proc?.notice ? <T size={14} style={{ color: c.warn }}>{proc.notice}</T> : null}

      {PROVIDER_IDS.map((p) => {
        const on = connected?.includes(p) ?? false;
        return (
          <View key={p} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <T weight="medium">
              {connected === null ? '…' : on ? `${PROVIDERS[p].name} מחובר ✓` : `${PROVIDERS[p].name} לא מחובר`}
              {both && preferred === p ? ' · בשימוש ראשון' : ''}
            </T>
            {PROVIDERS[p].trainsOnData ? (
              <T soft size={13}>בחשבון החינמי Google רשאית להשתמש בהקלטות לשיפור המודלים שלה.</T>
            ) : null}
            <View style={styles.actions}>
              <Button
                label={on ? 'חיבור מפתח אחר' : `חיבור ${PROVIDERS[p].name}`}
                kind={on || p !== 'groq' ? 'quiet' : 'primary'}
                onPress={() => router.push({ pathname: '/connect', params: { provider: p } })}
                style={{ flex: 1 }}
              />
              {on ? <Button label="ניתוק" kind="quiet" onPress={() => disconnect(p)} style={{ flex: 1 }} /> : null}
            </View>
            {both && preferred !== p ? (
              <Button label="להשתמש בו ראשון" kind="quiet" onPress={() => setPreferred(p)} />
            ) : null}
          </View>
        );
      })}

      <T weight="bold" size={18} style={{ marginTop: space.l }}>ייבוא שירים</T>
      <T soft style={{ lineHeight: 22 }}>
        הדרך הקלה: בוואטסאפ, לחיצה ארוכה על הקלטה או סרטון ← שיתוף ← Shiron. אפשר גם לבחור קבצים מאפליקציית הקבצים.
      </T>
      <Button
        label="בחירת קבצי שמע או וידאו"
        icon="folder-open-outline"
        kind="quiet"
        onPress={async () => {
          const message = await importFromPicker();
          if (message) toast(message);
        }}
      />

      <T weight="bold" size={18} style={{ marginTop: space.l }}>תמיכה</T>
      <Button label="יומן טכני" icon="document-text-outline" kind="quiet" onPress={() => router.push('/log')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, gap: space.m },
  actions: { flexDirection: 'row', gap: space.s },
});
