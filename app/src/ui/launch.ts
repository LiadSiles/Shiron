import * as SplashScreen from 'expo-splash-screen';

// The native splash (app colours + logo, app.json) stays up until the first real screen is
// drawn, then fades — no white or empty frame in between. Called at module scope as the docs
// ask; a failure only means the splash hides on its own.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });

let hidden = false;

/** The first screen has its content (fonts and the library are loaded): show it. */
export function appReady() {
  if (hidden) return;
  hidden = true;
  SplashScreen.hide();
}

/** Never keep her waiting on the splash: whatever is still loading, show the app after this. */
export const SPLASH_MAX_MS = 2500;
