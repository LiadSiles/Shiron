import { useEffect, useState } from 'react';
import { connectedProviders, onKeysChange } from '../api/keys';

let known: boolean | null = null;

/**
 * Whether an AI service is connected (null until known). Without one, a new song's name and
 * category are not on their way, so the rows don't say "waiting for a name" on every song
 * (the home screen's card offers to connect instead).
 */
export function useAiConnected(): boolean | null {
  const [connected, setConnected] = useState(known);
  useEffect(() => {
    let live = true;
    const update = () =>
      connectedProviders()
        .then((p) => {
          known = p.length > 0;
          if (live) setConnected(known);
        })
        .catch(() => undefined);
    update();
    const off = onKeysChange(update);
    return () => {
      live = false;
      off();
    };
  }, []);
  return connected;
}
