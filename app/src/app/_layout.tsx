import { Rubik_400Regular, Rubik_500Medium, Rubik_700Bold, useFonts } from '@expo-google-fonts/rubik';
import { Stack } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { AppState, I18nManager, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { describeSummary, importShareIntent } from '../ingest/ingest';
import { processQueue } from '../ingest/processor';
import { font, useTheme } from '../ui/theme';
import { toast, ToastHost } from '../ui/toast';

// Hebrew UI: right-to-left everywhere. The config plugin forces it natively;
// this covers the very first launch on Android.
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

/** Receives files and links shared from WhatsApp (or any app) into Shiron. */
function ShareHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const busy = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || busy.current) return;
    busy.current = true;
    toast('שומרת…');
    importShareIntent(shareIntent)
      .then((s) => toast(describeSummary(s)))
      .catch((e) => toast(`השמירה נכשלה: ${String(e)}`))
      .finally(() => {
        resetShareIntent();
        busy.current = false;
      });
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (error) toast(`שגיאה בקבלת השיתוף: ${error}`);
  }, [error]);

  return null;
}

export default function RootLayout() {
  const c = useTheme();
  const [fontsLoaded] = useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_700Bold });

  useEffect(() => {
    processQueue();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') processQueue();
    });
    return () => sub.remove();
  }, []);

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
          <Stack.Screen name="index" options={{ headerShown: false, title: 'שירון' }} />
          <Stack.Screen name="category/[id]" options={{ title: '' }} />
          <Stack.Screen name="song/[id]" options={{ title: 'פרטי שיר' }} />
          <Stack.Screen name="player" options={{ presentation: 'modal', title: 'מתנגן עכשיו' }} />
          <Stack.Screen name="youtube/[id]" options={{ title: 'יוטיוב' }} />
          <Stack.Screen name="settings" options={{ title: 'הגדרות' }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
