import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { checkGroqKey, saveGroqKey } from '../api/groq';
import { findGroqKey, GROQ_KEYS_PAGE, GroqError } from '../core/groqRules';
import { diag } from '../diag/log';
import { processQueue } from '../ingest/processor';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { font, radius, space, useTheme } from '../ui/theme';

type Phase = 'idle' | 'checking' | 'invalid' | 'offline' | 'no-browser';

/**
 * Connects the teacher's own free Groq account. The app opens the keys page, and when she comes
 * back with a copied key it is picked up from the clipboard, checked and saved — no typing.
 */
export default function ConnectScreen() {
  const c = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [manual, setManual] = useState('');
  const opened = useRef(false);
  const busy = useRef(false);

  const tryKey = useCallback(async (key: string) => {
    if (busy.current) return;
    busy.current = true;
    setPhase('checking');
    try {
      if (await checkGroqKey(key)) {
        await saveGroqKey(key);
        await Clipboard.setStringAsync('').catch(() => undefined); // don't leave the key lying around
        toast('Groq מחובר ✓ השירים יקבלו שם וקטגוריה');
        processQueue();
        router.back();
      } else {
        setPhase('invalid');
      }
    } catch (e) {
      setPhase(e instanceof GroqError && e.kind === 'network' ? 'offline' : 'invalid');
    } finally {
      busy.current = false;
    }
  }, []);

  /** Only reads the clipboard after she went to Groq, so iOS asks to paste at a moment that makes sense. */
  const checkClipboard = useCallback(async () => {
    if (!opened.current) return;
    try {
      if (!(await Clipboard.hasStringAsync())) return;
      const key = findGroqKey(await Clipboard.getStringAsync());
      if (key) await tryKey(key);
    } catch {
      /* clipboard unavailable: the paste field still works */
    }
  }, [tryKey]);

  useEffect(() => {
    // She may switch to the Groq page in a browser app instead of the in-app one.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkClipboard();
    });
    return () => sub.remove();
  }, [checkClipboard]);

  /**
   * In-app browser first (she stays in Shiron). On Android it needs a browser with Custom Tabs
   * support — Xiaomi's default browser often has none — so fall back to the system browser.
   * Android returns from openBrowserAsync at once; the AppState listener picks up her return.
   */
  const openGroq = async () => {
    opened.current = true;
    setPhase('idle');
    try {
      await WebBrowser.openBrowserAsync(GROQ_KEYS_PAGE, {
        dismissButtonStyle: 'done',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (e) {
      diag('in-app browser unavailable', e);
      try {
        await Linking.openURL(GROQ_KEYS_PAGE);
      } catch (e2) {
        diag('system browser unavailable', e2);
        setPhase('no-browser');
        return;
      }
    }
    if (Platform.OS === 'ios') await checkClipboard();
  };

  const manualKey = findGroqKey(manual);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <T weight="bold" size={24}>שם, מילים וקטגוריה לכל שיר</T>
      <T soft style={styles.p}>
        שירון שולח כל הקלטה לשירות AI חינמי בשם Groq, שמתמלל אותה ומציע שם וקטגוריה. החיבור נעשה פעם אחת
        ולוקח כשתי דקות. השירים נשמרים ומתנגנים גם בלעדיו.
      </T>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Step n={1} text="לחצי על הכפתור. אפשר להיכנס עם חשבון Google." />
        <Step n={2} text="בעמוד שנפתח: Create API Key ← לתת שם כלשהו (למשל שירון) ← Submit." />
        <Step n={3} text="ללחוץ Copy, ולסגור את העמוד. שירון יזהה את המפתח לבד." />
        <Button label="פתיחת Groq" icon="🔑" onPress={openGroq} style={{ marginTop: space.m }} />
      </View>

      {phase === 'checking' ? (
        <View style={styles.row}>
          <ActivityIndicator color={c.primary} />
          <T>בודקת את המפתח…</T>
        </View>
      ) : null}
      {phase === 'invalid' ? <T style={{ color: c.bad }}>המפתח לא עבד. נסי להעתיק אותו שוב מעמוד Groq.</T> : null}
      {phase === 'offline' ? <T style={{ color: c.warn }}>אין חיבור לאינטרנט. נסי שוב כשתהיה רשת.</T> : null}
      {phase === 'no-browser' ? (
        <T style={{ color: c.bad }} selectable>
          לא הצלחנו לפתוח דפדפן. אפשר לפתוח ידנית את הכתובת {GROQ_KEYS_PAGE} ולהדביק את המפתח למטה.
        </T>
      ) : null}

      <T soft size={14} style={{ marginTop: space.xl }}>המפתח לא זוהה? אפשר להדביק אותו כאן:</T>
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder="gsk_…"
        placeholderTextColor={c.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        accessibilityLabel="מפתח Groq"
        style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.regular }]}
      />
      <Button label="שמירה" kind="quiet" disabled={!manualKey || phase === 'checking'} onPress={() => manualKey && tryKey(manualKey)} />

      <T soft size={13} style={styles.p}>
        המפתח נשמר רק בטלפון הזה, באזור המאובטח של המערכת. ההקלטות נשלחות ל-Groq לצורך התמלול בלבד.
      </T>
    </ScrollView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const c = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.num, { backgroundColor: c.primarySoft }]}>
        <T weight="bold" style={{ color: c.primary }}>{n}</T>
      </View>
      <T style={{ flex: 1, lineHeight: 22 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.m, paddingBottom: 60 },
  p: { lineHeight: 22 },
  card: { padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, gap: space.m },
  step: { flexDirection: 'row', gap: space.m, alignItems: 'flex-start' },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, fontSize: 16, writingDirection: 'ltr' },
});
