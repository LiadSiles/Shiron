import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { attachYoutube, youtubeEvent } from '../player/player';
import { T } from './components';
import { Icon } from './Icon';
import { radius, space, useTheme } from './theme';

/** No word from YouTube's player after this long: most likely no internet. */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * YouTube's own player — YouTube's terms allow playing only in a visible embedded player (no
 * download, no background). Mounted once for the whole app by ui/YouTubeHost, so it keeps
 * playing between screens. The IFrame API reports play state, time and the end of the video,
 * so a YouTube song sits in the queue like any other: the player moves on when it ends, and
 * play/pause/seek work from the app's controls.
 */
export function YouTubeView({ videoId, style, compact }: { videoId: string; style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const c = useTheme();
  // loading → ready, or offline (no network / never loaded) with a retry; `attempt` reloads it.
  const [phase, setPhase] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPhase('loading');
    const timer = setTimeout(() => {
      setPhase((p) => {
        if (p !== 'loading') return p;
        youtubeEvent({ playing: false, error: 'אין חיבור לאינטרנט — שירי יוטיוב צריכים רשת' });
        return 'offline';
      });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [videoId, attempt]);

  const offline = () => {
    setPhase('offline');
    youtubeEvent({ playing: false, error: 'אין חיבור לאינטרנט — שירי יוטיוב צריכים רשת' });
  };

  // react-native-webview types WebView as a function component without a ref; it has one.
  const web = useRef<{ injectJavaScript(script: string): void } | null>(null);

  useEffect(
    () =>
      attachYoutube({
        play: () => web.current?.injectJavaScript('window.player && player.playVideo(); true;'),
        pause: () => web.current?.injectJavaScript('window.player && player.pauseVideo(); true;'),
        seek: (s) => web.current?.injectJavaScript(`window.player && player.seekTo(${Number(s) || 0}, true); true;`),
      }),
    [],
  );

  const html = useMemo(() => page(videoId), [videoId]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { t?: string; s?: number; p?: number; d?: number; c?: number };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.t === 'ready') setPhase('ready');
    else if (m.t === 'offline') offline();
    else if (m.t === 'time') youtubeEvent({ position: m.p, duration: m.d });
    else if (m.t === 'state') {
      // YT.PlayerState: 1 playing, 2 paused, 0 ended, 3 buffering.
      if (m.s === 1) youtubeEvent({ playing: true });
      else if (m.s === 2) youtubeEvent({ playing: false });
      else if (m.s === 0) youtubeEvent({ playing: false, ended: true });
    } else if (m.t === 'error') {
      // 101/150: the owner doesn't allow embedding; 100: removed or private — never playable here.
      // 2/5 (bad request, HTML5 player error) are usually the connection: not skipped.
      const permanent = m.c === 100 || m.c === 101 || m.c === 150;
      setPhase('ready');
      youtubeEvent({
        playing: false,
        permanent,
        error: m.c === 100 ? 'הסרטון הוסר או פרטי'
          : permanent ? 'יוטיוב לא מאפשר לנגן את הסרטון הזה מחוץ לאפליקציה שלו'
          : 'יוטיוב לא הצליח לנגן את הסרטון. בדקי את החיבור לאינטרנט',
      });
    }
  };

  return (
    <View style={[{ backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }, style]}>
      <WebView
        ref={web as never}
        key={`${videoId}-${attempt}`}
        onError={offline}
        source={{ html, baseUrl: 'https://shiron.app' }}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
      />
      {phase !== 'ready' ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          {phase === 'loading' ? (
            <>
              <ActivityIndicator color="#fff" size="large" />
              {compact ? null : <T weight="medium" style={styles.overlayText}>טוען מיוטיוב…</T>}
            </>
          ) : (
            <>
              <Icon name="cloud-offline-outline" size={40} color="#fff" />
              <T weight="medium" size={compact ? 13 : undefined} style={styles.overlayText}>
                {compact ? 'אין אינטרנט' : 'אין חיבור לאינטרנט. שירי יוטיוב צריכים רשת.'}
              </T>
              <Pressable
                onPress={() => setAttempt((a) => a + 1)}
                accessibilityRole="button"
                style={[styles.retry, { backgroundColor: c.primary }]}
              >
                <Icon name="refresh" size={18} color={c.primaryInk} />
                <T weight="medium" style={{ color: c.primaryInk }}>נסי שוב</T>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function page(videoId: string): string {
  const id = JSON.stringify(videoId);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000;height:100%}#p{width:100%;height:100%}</style></head>
<body><div id="p"></div>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.onerror=function(){post({t:'offline'});};document.head.appendChild(tag);
function onYouTubeIframeAPIReady(){
  window.player=new YT.Player('p',{videoId:${id},host:'https://www.youtube-nocookie.com',
    playerVars:{autoplay:1,playsinline:1,rel:0,origin:'https://shiron.app'},
    events:{
      onReady:function(e){post({t:'ready'});e.target.playVideo();},
      onStateChange:function(e){post({t:'state',s:e.data});},
      onError:function(e){post({t:'error',c:e.data});}
    }});
  setInterval(function(){
    if(window.player&&player.getCurrentTime){post({t:'time',p:player.getCurrentTime(),d:player.getDuration()});}
  },500);
}
</script></body></html>`;
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  overlayText: { color: '#fff', textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 48, paddingHorizontal: space.l, borderRadius: radius.m },
});
