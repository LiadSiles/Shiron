import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { attachYoutube, youtubeEvent, youtubeResumePoint } from '../player/player';
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
  // A reload: she tapped "נסי שוב" (plays from the start), or the system dropped the page in
  // the background (picks up where it was, playing only if it was playing).
  // A new video starts from the beginning and plays.
  const [loaded, setLoad] = useState({ videoId, attempt: 0, start: 0, play: true });
  const load = loaded.videoId === videoId ? loaded : { videoId, attempt: 0, start: 0, play: true };
  const attempt = load.attempt;
  const retry = () => setLoad({ videoId, attempt: attempt + 1, start: 0, play: true });
  const restore = () => {
    const r = youtubeResumePoint();
    setLoad({ videoId, attempt: attempt + 1, start: r.start, play: r.play });
  };

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

  const html = useMemo(() => page(videoId, load.start, load.play), [videoId, load.start, load.play]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { t?: string; s?: number; p?: number; d?: number; c?: number };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.t === 'ready') {
      setPhase('ready');
      // Reloaded paused while she was away, and she's back with it playing: play now.
      if (!load.play && youtubeResumePoint().play) web.current?.injectJavaScript('window.player && player.playVideo(); true;');
    }
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
        // No system picture-in-picture outside the app: YouTube's terms forbid playing with the
        // app minimized (docs/wiki/decisions.md).
        allowsPictureInPictureMediaPlayback={false}
        // The system may drop the page while the app is in the background (iOS) or the renderer
        // may die (Android — unhandled, that closes the app): load it again where it was.
        onContentProcessDidTerminate={restore}
        onRenderProcessGone={restore}
        javaScriptEnabled
        // A player, not a page: nothing to scroll (in the small window it looked like one).
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
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
                onPress={retry}
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

function page(videoId: string, start: number, play: boolean): string {
  const id = JSON.stringify(videoId);
  const from = Math.max(0, Math.floor(start) || 0);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;background:#000;height:100%;overflow:hidden}#p{width:100%;height:100%}</style></head>
<body><div id="p"></div>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.onerror=function(){post({t:'offline'});};document.head.appendChild(tag);
function onYouTubeIframeAPIReady(){
  window.player=new YT.Player('p',{videoId:${id},host:'https://www.youtube-nocookie.com',
    playerVars:{autoplay:${play ? 1 : 0},playsinline:1,rel:0,start:${from},origin:'https://shiron.app'},
    events:{
      onReady:function(e){post({t:'ready'});${play ? 'e.target.playVideo();' : ''}},
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
