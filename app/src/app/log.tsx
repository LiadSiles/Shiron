import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { clearDiag, onDiag, readDiag } from '../diag/log';
import { Button, T } from '../ui/components';
import { toast } from '../ui/toast';
import { space } from '../ui/theme';

/** Settings → יומן טכני: recent import / conversion / AI / playback events, to copy and send. */
export default function LogScreen() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    readDiag().then(setLines);
    return onDiag(setLines);
  }, []);

  const header = `PlayGan ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${Platform.Version}`;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: space.s, padding: space.l }}>
        <Button
          label="העתקה"
          icon="copy-outline"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync([header, ...lines].join('\n'));
            toast('היומן הועתק', 'success');
          }}
        />
        <Button label="ניקוי" kind="quiet" style={{ flex: 1 }} onPress={() => clearDiag()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 40, gap: 6 }}>
        <T soft size={12} selectable style={{ writingDirection: 'ltr', textAlign: 'left' }}>{header}</T>
        {lines.length === 0 ? <T soft>היומן ריק.</T> : null}
        {[...lines].reverse().map((l, i) => (
          <T key={i} size={12} selectable style={{ writingDirection: 'ltr', textAlign: 'left' }}>{l}</T>
        ))}
      </ScrollView>
    </View>
  );
}
