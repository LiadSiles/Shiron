import { Rubik_400Regular, Rubik_500Medium, Rubik_700Bold, useFonts } from '@expo-google-fonts/rubik';
import Constants from 'expo-constants';
import { useLinkingURL } from 'expo-linking';
import { router, Stack } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
import { AppState, I18nManager, Platform, View } from 'react-native';
import { appGroupStatus } from '../../modules/shiron-audio';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { connectedProviders } from '../api/keys';
import { diag } from '../diag/log';
import { getSetting, setSetting } from '../db/repo';
import { sharedTextFromUrl } from '../core/incoming';
import { enqueueShare, ImportSummary } from '../ingest/ingest';
import { showImportResult } from '../ui/importResult';
import { YouTubeHost } from '../ui/YouTubeHost';
import { keepWorkingInBackground, registerBackgroundProcessing } from '../ingest/background';
import { processQueue, retryUnconvertedAfterUpdate } from '../ingest/processor';
import { appReady, SPLASH_MAX_MS } from '../ui/launch';
import { font, useTheme } from '../ui/theme';
import { StatusHost, toast } from '../ui/toast';

/** app.json → expo.scheme */
const SCHEME = 'shiron';

// Hebrew UI: right-to-left everywhere. The config plugin forces it natively;
// this covers the very first launch on Android.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

/**
 * Receives files and links shared from WhatsApp (or any app) into the app. Each share is taken
 * at once and queued (enqueueShare), so sharing again while a big batch is still saving works,
 * as many times as she likes.
 */
function ShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const intent = shareIntent;
    resetShareIntent(); // free the slot for the next share; the files stay where they are
    report(enqueueShare(intent));
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (error) toast(`שגיאה בקבלת השיתוף: ${error}`, 'error');
  }, [error]);

  // A link the extension sent inside the URL, having no App Group (core/incoming).
  const url = useLinkingURL();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const text = sharedTextFromUrl(url, SCHEME);
    if (!text || handled.current === url) return;
    handled.current = url;
    report(enqueueShare({ type: 'text', text, files: null, webUrl: null }));
  }, [url]);

  return null;
}

/** Progress shows in the status banner (ui/ActivityBanner); the result as a toast. */
function report(saving: Promise<ImportSummary>) {
  saving
    .then(async (s) => {
      showImportResult(s);
      if (s.added.length) await offerConnectOnce();
    })
    .catch((e) => toast(`השמירה נכשלה: ${String(e)}`, 'error'));
}

/** After the first song arrives, show how to connect an AI service — once; later the home banner reminds. */
async function offerConnectOnce() {
  if ((await connectedProviders()).length) return;
  if (await getSetting('connectOffered')) return;
  await setSetting('connectOffered', '1');
  router.push('/connect');
}

export default function RootLayout() {
  const c = useTheme();
  const [fontsLoaded] = useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_700Bold });

  // The window behind every screen and transition, so nothing ever flashes white (dark mode too).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  // The home screen calls appReady() once its songs are drawn; this is only the safety net.
  useEffect(() => {
    const t = setTimeout(appReady, SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // For the technical log: can the share extension pass files on this install?
    if (Platform.OS === 'ios') {
      const g = appGroupStatus();
      diag('app group', g?.granted ?? 'none granted', `declared ${g?.declared ?? '-'}`,
        `provisioned ${g?.provisioned.join(',') || '-'}`, `alt ${g?.alt.join(',') || '-'}`);
    }
    keepWorkingInBackground();
    processQueue();
    retryUnconvertedAfterUpdate(Constants.expoConfig?.version ?? '').catch((e) => diag('retry after update failed', e));
    void registerBackgroundProcessing();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') processQueue();
    });
    return () => sub.remove();
  }, []);

  // The splash is still showing meanwhile (ui/launch.ts).
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <ShareHandler />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.ink,
            headerTitleStyle: { fontFamily: font.bold },
            headerShadowVisible: false,
            headerBackTitle: 'חזרה',
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, title: 'PlayGan' }} />
          <Stack.Screen name="category/[id]" options={{ title: '' }} />
          <Stack.Screen name="category/edit" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="song/[id]" options={{ title: 'פרטי שיר' }} />
          <Stack.Screen name="playlist/[id]" options={{ title: '' }} />
          <Stack.Screen name="playlist/pick" options={{ presentation: 'modal', title: 'בחירת שירים' }} />
          <Stack.Screen name="playlist/add" options={{ presentation: 'modal', title: 'הוספה לרשימה' }} />
          {/* A card, not a native modal: YouTube's app-wide player (YouTubeHost) must be able to sit
              above it — native modals cover every view of the root. */}
          <Stack.Screen name="player" options={{ animation: 'slide_from_bottom', title: 'מתנגן עכשיו' }} />
          <Stack.Screen name="settings" options={{ title: 'הגדרות' }} />
          <Stack.Screen name="connect" options={{ presentation: 'modal', title: 'חיבור שירות AI' }} />
          <Stack.Screen name="log" options={{ title: 'יומן טכני' }} />
        </Stack>
        <YouTubeHost />
        <StatusHost />
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
