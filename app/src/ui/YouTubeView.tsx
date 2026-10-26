import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { attachYoutube, youtubeEvent } from '../player/player';

/**
 * YouTube's own player, visible on the full player screen — YouTube's terms allow playing only
 * in a visible embedded player (no download, no background). The IFrame API reports play state,
 * time and the end of the video, so a YouTube song sits in the queue like any other: the player
 * moves on when it ends, and play/pause/seek work from the app's controls.
 */
export function YouTubeView({ videoId }: { videoId: string }) {
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
    if (m.t === 'time') youtubeEvent({ position: m.p, duration: m.d });
    else if (m.t === 'state') {
      // YT.PlayerState: 1 playing, 2 paused, 0 ended, 3 buffering.
      if (m.s === 1) youtubeEvent({ playing: true });
      else if (m.s === 2) youtubeEvent({ playing: false });
      else if (m.s === 0) youtubeEvent({ playing: false, ended: true });
    } else if (m.t === 'error') {
      // 101/150: the owner doesn't allow embedding; 100: removed or private.
      youtubeEvent({ playing: false, error: m.c === 100 ? 'הסרטון הוסר או פרטי' : 'יוטיוב לא מאפשר לנגן את הסרטון הזה מחוץ לאפליקציה שלו' });
    }
  };

  return (
    <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        ref={web as never}
        key={videoId}
        source={{ html, baseUrl: 'https://shiron.app' }}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
      />
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
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
function onYouTubeIframeAPIReady(){
  window.player=new YT.Player('p',{videoId:${id},host:'https://www.youtube-nocookie.com',
    playerVars:{autoplay:1,playsinline:1,rel:0,origin:'https://shiron.app'},
    events:{
      onReady:function(e){e.target.playVideo();},
      onStateChange:function(e){post({t:'state',s:e.data});},
      onError:function(e){post({t:'error',c:e.data});}
    }});
  setInterval(function(){
    if(window.player&&player.getCurrentTime){post({t:'time',p:player.getCurrentTime(),d:player.getDuration()});}
  },500);
}
</script></body></html>`;
}
