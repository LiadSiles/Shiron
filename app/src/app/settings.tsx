import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { checkServer, getServerConfig, saveServerConfig } from '../api/client';
import { describeSummary, importFromPicker } from '../ingest/ingest';
import { processQueue } from '../ingest/processor';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { font, radius, space, useTheme } from '../ui/theme';

export default function SettingsScreen() {
  const c = useTheme();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getServerConfig().then((cfg) => {
      if (cfg) {
        setUrl(cfg.url);
        setToken(cfg.token);
      }
    });
  }, []);

  const save = async () => {
    const cfg = { url: url.trim(), token: token.trim() };
    await saveServerConfig(cfg);
    const res = await checkServer(cfg);
    setStatus(res.message);
    if (res.ok) {
      toast('השרת מחובר');
      processQueue();
    }
  };

  const input = [styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.regular }];

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <T weight="bold" size={18}>ייבוא שירים</T>
      <T soft>הדרך הקלה: בוואטסאפ, לחיצה ארוכה על הקלטה ← שיתוף ← שירון. אפשר גם לבחור קבצים מאפליקציית הקבצים.</T>
      <Button
        label="בחירת קבצי שמע"
        icon="📁"
        kind="quiet"
        onPress={async () => {
          const s = await importFromPicker();
          if (s) toast(describeSummary(s));
        }}
      />

      <View style={{ height: space.l }} />
      <T weight="bold" size={18}>שרת עיבוד</T>
      <T soft>השרת ממיר הקלטות וואטסאפ לפורמט שהאייפון מנגן, מתמלל אותן ונותן שם וקטגוריה.</T>
      <T size={14}>כתובת</T>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://shiron-server.example.com"
        placeholderTextColor={c.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={input}
      />
      <T size={14}>מפתח גישה</T>
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder="APP_TOKEN מהשרת"
        placeholderTextColor={c.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={input}
      />
      <Button label="שמירה ובדיקת חיבור" onPress={save} disabled={!url.trim()} />
      {status ? <T soft>{status}</T> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, fontSize: 16, writingDirection: 'ltr' },
});
