import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// The native splash (app colours + logo, app.json) stays up until the first real screen is
// drawn, then fades — no white or empty frame in between. Called at module scope as the docs
// ask; a failure only means the splash hides on its own.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Android: no fade. Its exit animation starts after the app's first frame and showed the splash
// again over it (CI film, 0.16.2); our patch removes the splash at once when duration is 0.
SplashScreen.setOptions(Platform.OS === 'android' ? { fade: false, duration: 0 } : { fade: true, duration: 250 });

/**
 * What the first screen needs before it is shown, so nothing on it moves once she sees it
 * (owner, 0.15.1: the home screen "flickered" on opening): her songs, whether an AI service
 * is connected (it decides the "connect" card and the rows' second lines) and how she likes
 * her lists laid out (rows or tiles). Fonts come first in the root layout.
 */
type Need = 'library' | 'ai' | 'prefs';
const waiting = new Set<Need>(['library', 'ai', 'prefs']);
let hidden = false;

/** One of the first screen's needs is in; the splash fades out once all are. */
export function launchReady(need: Need) {
  waiting.delete(need);
  if (!waiting.size) hideSplash();
}

/** Shows the app: once everything is in, or after SPLASH_MAX_MS whatever is still loading. */
export function hideSplash() {
  if (hidden) return;
  hidden = true;
  SplashScreen.hide();
}

/** Never keep her waiting on the splash: whatever is still loading, show the app after this. */
export const SPLASH_MAX_MS = 2500;
