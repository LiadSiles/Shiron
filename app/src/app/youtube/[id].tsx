import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Song } from '../../core/types';
import { getSong, recordPlay } from '../../db/repo';
import { pause } from '../../player/player';
import { Button, T } from '../../ui/components';
import { space } from '../../ui/theme';

/**
 * YouTube's terms require a visible player and forbid downloading, so YouTube links play
 * here, in the foreground only (see "מגבלת יוטיוב" in the design doc).
 */
export default function YoutubeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    pause();
    getSong(id).then(setSong);
    const startedAt = Date.now();
    return () => {
      const listenedSec = Math.round((Date.now() - startedAt) / 1000);
      if (listenedSec >= 5) recordPlay({ songId: id, startedAt, listenedSec });
    };
  }, [id]);

  if (!song?.youtubeId) return null;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="https://www.youtube-nocookie.com/embed/${song.youtubeId}?autoplay=1&playsinline=1&rel=0"
allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></body></html>`;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: song.title }} />
      <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}>
        <WebView
          source={{ html, baseUrl: 'https://shiron.app' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          javaScriptEnabled
        />
      </View>
      <View style={{ padding: space.l, gap: space.m }}>
        <T weight="bold" size={20}>{song.title}</T>
        <T soft>שירי יוטיוב מתנגנים רק כשהמסך הזה פתוח. כדי לנגן ברקע, שמרי את השיר כקובץ שמע.</T>
        <Button label="פתיחה באפליקציית יוטיוב" kind="quiet" onPress={() => Linking.openURL(`https://youtu.be/${song.youtubeId}`)} />
      </View>
    </View>
  );
}
