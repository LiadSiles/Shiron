import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { appGroupStatus } from '../../modules/shiron-audio';
import { connectedProviders, getPreferred, onKeysChange, removeKey, setPreferred } from '../api/keys';
import { PROVIDER_IDS, PROVIDERS, ProviderId } from '../core/ai';
import { processorStore } from '../ingest/processor';
import Constants from 'expo-constants';
import { T } from '../ui/components';
import { Icon } from '../ui/Icon';
import { pickAndImport } from '../ui/importResult';
import { ListGroup, ListItem } from '../ui/list';
import { radius, space, useTheme } from '../ui/theme';
import { useStore } from '../ui/useStore';

/** iPhone: can the share sheet hand files to the app on this install? (null on Android) */
const shareFiles = Platform.OS === 'ios' ? !!appGroupStatus()?.granted : null;

export default function SettingsScreen() {
  const c = useTheme();
  const [connected, setConnected] = useState<ProviderId[] | null>(null);
  const [preferred, setPreferredState] = useState<ProviderId>('groq');
  const proc = useStore(processorStore);

  useEffect(() => {
    const load = () => {
      connectedProviders().then(setConnected);
      getPreferred().then(setPreferredState);
    };
    load();
    return onKeysChange(load);
  }, []);

  const disconnect = (p: ProviderId) =>
    Alert.alert(`לנתק את ${PROVIDERS[p].name}?`, 'שירים חדשים יישמרו ויתנגנו. אם אין שירות מחובר אחר, הם לא יקבלו שם וקטגוריה עד החיבור הבא.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'ניתוק', style: 'destructive', onPress: () => removeKey(p) },
    ]);

  const both = (connected?.length ?? 0) > 1;
  const isOn = (p: ProviderId) => connected?.includes(p) ?? false;
  const other = (p: ProviderId) => PROVIDER_IDS.find((x) => x !== p)!;
  const connectedList = PROVIDER_IDS.filter(isOn);

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: 0, paddingBottom: 60 }}>
      {proc?.notice ? (
        <View style={[styles.notice, { backgroundColor: c.warn + '1F', borderColor: c.warn }]}>
          <Icon name="alert-circle" size={20} color={c.warn} />
          <T size={14} style={{ flex: 1, lineHeight: 20 }}>{proc.notice}</T>
        </View>
      ) : null}

      <ListGroup
        title="שם, מילים וקטגוריה אוטומטיים"
        footer="שירות AI חינמי מתמלל את ההקלטות ומציע לכל שיר שם, מילים וקטגוריה. לכל שירות יש מכסה יומית; כששניהם מחוברים, השני ממשיך כשהמכסה של הראשון נגמרת."
      >
        {PROVIDER_IDS.map((p, i) => (
          <ListItem
            key={p}
            icon={p === 'groq' ? 'flash' : 'sparkles'}
            tint={p === 'groq' ? '#D9573B' : '#4A6FB5'}
            title={PROVIDERS[p].name + (both && preferred === p ? ' · ראשון' : '')}
            subtitle={
              PROVIDERS[p].trainsOnData
                ? 'בחשבון החינמי Google רשאית להשתמש בהקלטות לשיפור המודלים שלה'
                : 'מומלץ · מתמלל הקלטות בעברית'
            }
            value={connected === null ? '…' : isOn(p) ? 'מחובר ✓' : 'לחיבור'}
            onPress={() => router.push({ pathname: '/connect', params: { provider: p } })}
            last={i === PROVIDER_IDS.length - 1}
          />
        ))}
      </ListGroup>

      {connectedList.length ? (
        <ListGroup title="ניהול החיבור">
          {both ? (
            <ListItem
              icon="swap-horizontal"
              tint={c.accent}
              title={`להשתמש קודם ב-${PROVIDERS[other(preferred)].name}`}
              subtitle={`עכשיו ${PROVIDERS[preferred].name} ראשון`}
              onPress={() => setPreferred(other(preferred))}
              chevron={false}
            />
          ) : null}
          {connectedList.map((p, i) => (
            <ListItem
              key={p}
              icon="close-circle-outline"
              title={`ניתוק ${PROVIDERS[p].name}`}
              onPress={() => disconnect(p)}
              danger
              chevron={false}
              last={i === connectedList.length - 1}
            />
          ))}
        </ListGroup>
      ) : null}

      <ListGroup
        title="הוספת שירים"
        footer={shareFiles === false
          ? 'בהתקנה הזו של האפליקציה (Sideloadly עם Apple ID חינמי) השיתוף מוואטסאפ מעביר רק קישורים. הקלטות: שמרי אותן ב״קבצים״ ובחרי אותן כאן.'
          : 'הדרך הקלה: בוואטסאפ, לחיצה ארוכה על הקלטה, שיר או סרטון ← שיתוף ← PlayGan. אפשר לבחור כמה יחד.'}
      >
        {shareFiles !== null ? (
          <ListItem
            icon="share-outline"
            tint={shareFiles ? c.good : c.inkSoft}
            title="שיתוף מוואטסאפ"
            value={shareFiles ? 'הקלטות וקישורים' : 'רק קישורים'}
          />
        ) : null}
        <ListItem
          icon="folder-open-outline"
          tint={c.good}
          title="בחירת קבצי שמע או וידאו"
          subtitle="מאפליקציית הקבצים בטלפון"
          onPress={pickAndImport}
          last
        />
      </ListGroup>

      <ListGroup title="עזרה">
        <ListItem
          icon="document-text-outline"
          tint={c.inkSoft}
          title="יומן טכני"
          subtitle="לשליחה למפתח כשמשהו לא עובד"
          onPress={() => router.push('/log')}
        />
        <ListItem icon="information-circle-outline" tint={c.inkSoft} title="גרסה" value={Constants.expoConfig?.version ?? '—'} last />
      </ListGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start', padding: space.m, borderRadius: radius.m, borderWidth: 1, marginTop: space.l },
});
