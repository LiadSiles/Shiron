import * as SecureStore from 'expo-secure-store';
import { PROVIDER_IDS, ProviderId } from '../core/ai';
import { getSetting, setSetting } from '../db/repo';

/**
 * The teacher's own keys, one per service, in the iOS Keychain / Android Keystore — never in
 * the database, the build or the repo. Which service goes first is a plain setting.
 */

const STORE_NAME: Record<ProviderId, string> = { groq: 'groqApiKey', gemini: 'geminiApiKey' };
const PREFERRED = 'aiProvider';

const cache = new Map<ProviderId, string | null>();
type Listener = () => void;
const listeners = new Set<Listener>();
const changed = () => listeners.forEach((l) => l());

export async function getKey(provider: ProviderId): Promise<string | null> {
  if (!cache.has(provider)) cache.set(provider, await SecureStore.getItemAsync(STORE_NAME[provider]));
  return cache.get(provider) ?? null;
}

export async function saveKey(provider: ProviderId, key: string): Promise<void> {
  await SecureStore.setItemAsync(STORE_NAME[provider], key);
  cache.set(provider, key);
  changed();
}

export async function removeKey(provider: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_NAME[provider]);
  cache.set(provider, null);
  changed();
}

export async function connectedProviders(): Promise<ProviderId[]> {
  const keys = await Promise.all(PROVIDER_IDS.map(getKey));
  return PROVIDER_IDS.filter((_, i) => !!keys[i]);
}

/** The service she chose to use first; Groq unless she picked another. */
export async function getPreferred(): Promise<ProviderId> {
  const v = await getSetting(PREFERRED);
  return PROVIDER_IDS.includes(v as ProviderId) ? (v as ProviderId) : 'groq';
}

export async function setPreferred(provider: ProviderId): Promise<void> {
  await setSetting(PREFERRED, provider);
  changed();
}

/** Keys connected, removed, or the preferred service changed. */
export function onKeysChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
