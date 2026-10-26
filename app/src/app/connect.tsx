import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { checkGeminiKey } from '../api/gemini';
import { checkGroqKey } from '../api/groq';
import { saveKey } from '../api/keys';
import { AiError, findKey, PROVIDER_IDS, PROVIDERS, ProviderId } from '../core/ai';
import { diag } from '../diag/log';
import { processQueue } from '../ingest/processor';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { font, radius, space, useTheme } from '../ui/theme';

type Phase = 'idle' | 'checking' | 'invalid' | 'offline' | 'no-browser';

/** What she does on each service's keys page. */
const STEPS: Record<ProviderId, string[]> = {
  groq: [
    'לחצי על הכפתור. אפשר להיכנס עם חשבון Google.',
    'בעמוד שנפתח: Create API Key ← לתת שם כלשהו (למשל שירון) ← Submit.',
    'ללחוץ Copy, ולסגור את העמוד. שירון יזהה את המפתח לבד.',
  ],
  gemini: [
    'לחצי על הכפתור ותיכנסי עם חשבון Google.',
    'בעמוד שנפתח: Create API key (אם מתבקש — לאשר את התנאים ולבחור פרויקט).',
    'ללחוץ על סמל ההעתקה ליד המפתח, ולסגור את העמוד. שירון יזהה את המפתח לבד.',
  ],
};

const CHECK: Record<ProviderId, (key: string) => Promise<boolean>> = { groq: checkGroqKey, gemini: checkGeminiKey };

/**
 * Connects the teacher's own free account at an AI service (Groq or Gemini). The app opens the
 * keys page, and when she comes back with a copied key it is picked up from the clipboard,
 * checked and saved — no typing. `?provider=gemini` opens on Gemini.
 */
export default function ConnectScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ provider?: string }>();
  const [provider, setProvider] = useState<ProviderId>(params.provider === 'gemini' ? 'gemini' : 'groq');
  const [phase, setPhase] = useState<Phase>('idle');
  const [manual, setManual] = useState('');
  const opened = useRef(false);
  const busy = useRef(false);
  const info = PROVIDERS[provider];

  const tryKey = useCallback(async (p: ProviderId, key: string) => {
    if (busy.current) return;
    busy.current = true;
    setPhase('checking');
    try {
      if (await CHECK[p](key)) {
        await saveKey(p, key);
        await Clipboard.setStringAsync('').catch(() => undefined); // don't leave the key lying around
        toast(`${PROVIDERS[p].name} מחובר ✓ השירים יקבלו שם וקטגוריה`);
        processQueue();
        router.back();
      } else {
        setPhase('invalid');
      }
    } catch (e) {
      setPhase(e instanceof AiError && e.kind === 'network' ? 'offline' : 'invalid');
    } finally {
      busy.current = false;
    }
  }, []);

  /**
   * Only reads the clipboard after she went to a keys page, so iOS asks to paste at a moment
   * that makes sense. A key of either service is recognised, whichever tab is showing.
   */
  const checkClipboard = useCallback(async () => {
    if (!opened.current) return;
    try {
      if (!(await Clipboard.hasStringAsync())) return;
      const text = await Clipboard.getStringAsync();
      for (const p of PROVIDER_IDS) {
        const key = findKey(p, text);
        if (key) {
          setProvider(p);
          await tryKey(p, key);
          return;
        }
      }
    } catch {
      /* clipboard unavailable: the paste field still works */
    }
  }, [tryKey]);

  useEffect(() => {
    // She may switch to the keys page in a browser app instead of the in-app one.
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
  const openKeysPage = async () => {
    opened.current = true;
    setPhase('idle');
    try {
      await WebBrowser.openBrowserAsync(info.keysPage, {
        dismissButtonStyle: 'done',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (e) {
      diag('in-app browser unavailable', e);
      try {
        await Linking.openURL(info.keysPage);
      } catch (e2) {
        diag('system browser unavailable', e2);
        setPhase('no-browser');
        return;
      }
    }
    if (Platform.OS === 'ios') await checkClipboard();
  };

  const manualKey = findKey(provider, manual);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <T weight="bold" size={24}>שם, מילים וקטגוריה לכל שיר</T>
      <T soft style={styles.p}>
        שירון שולח כל הקלטה לשירות AI חינמי, שמתמלל אותה ומציע שם וקטגוריה. החיבור נעשה פעם אחת ולוקח כשתי
        דקות. השירים נשמרים ומתנגנים גם בלעדיו. אפשר לחבר שני שירותים: כשהמכסה היומית של אחד נגמרת, השני ממשיך.
      </T>

      <View style={styles.tabs} accessibilityRole="tablist">
        {PROVIDER_IDS.map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              setProvider(p);
              setPhase('idle');
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: p === provider }}
            style={[styles.tab, { backgroundColor: p === provider ? c.primary : c.surfaceAlt }]}
          >
            <T weight="medium" style={{ color: p === provider ? c.primaryInk : c.ink }}>
              {PROVIDERS[p].name}{p === 'groq' ? ' (מומלץ)' : ''}
            </T>
          </Pressable>
        ))}
      </View>

      {info.trainsOnData ? (
        <View style={[styles.warning, { borderColor: c.warn }]}>
          <T weight="bold" style={{ color: c.warn }}>חשוב לדעת לפני שמחברים את {info.name}</T>
          <T style={styles.p}>
            בחשבון החינמי, Google רשאית להשתמש בהקלטות ובמילים שנשלחות אליה כדי לשפר את המודלים שלה, ועובדים של
            Google עשויים לקרוא אותן. ההקלטות מהגן עלולות לכלול קולות של ילדים. Groq לא משתמש בהן כך.
          </T>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        {STEPS[provider].map((text, i) => (
          <Step key={i} n={i + 1} text={text} />
        ))}
        <Button label={`פתיחת ${info.name}`} icon="🔑" onPress={openKeysPage} style={{ marginTop: space.m }} />
      </View>

      {phase === 'checking' ? (
        <View style={styles.row}>
          <ActivityIndicator color={c.primary} />
          <T>בודקת את המפתח…</T>
        </View>
      ) : null}
      {phase === 'invalid' ? <T style={{ color: c.bad }}>המפתח לא עבד. נסי להעתיק אותו שוב מעמוד {info.name}.</T> : null}
      {phase === 'offline' ? <T style={{ color: c.warn }}>אין חיבור לאינטרנט. נסי שוב כשתהיה רשת.</T> : null}
      {phase === 'no-browser' ? (
        <T style={{ color: c.bad }} selectable>
          לא הצלחנו לפתוח דפדפן. אפשר לפתוח ידנית את הכתובת {info.keysPage} ולהדביק את המפתח למטה.
        </T>
      ) : null}

      <T soft size={14} style={{ marginTop: space.xl }}>המפתח לא זוהה? אפשר להדביק אותו כאן:</T>
      <TextInput
        value={manual}
        onChangeText={setManual}
        placeholder={provider === 'groq' ? 'gsk_…' : 'AIza…'}
        placeholderTextColor={c.inkSoft}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        accessibilityLabel={`מפתח ${info.name}`}
        style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.regular }]}
      />
      <Button
        label="שמירה"
        kind="quiet"
        disabled={!manualKey || phase === 'checking'}
        onPress={() => manualKey && tryKey(provider, manualKey)}
      />

      <T soft size={13} style={styles.p}>
        המפתח נשמר רק בטלפון הזה, באזור המאובטח של המערכת. ההקלטות נשלחות ל-{info.name} לצורך התמלול והשם בלבד.
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
  tabs: { flexDirection: 'row', gap: space.s },
  tab: { flex: 1, minHeight: 48, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  warning: { borderWidth: 1.5, borderRadius: radius.l, padding: space.l, gap: space.s },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, fontSize: 16, writingDirection: 'ltr' },
});
