import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View, ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCategory, primaryCategoryId, UNSORTED_ID } from '../core/categories';
import { nextRepeat } from '../core/queue';
import { cycleRepeat, next, previous, seek, setPlayerScreenOpen, togglePlay, usePlayer, youtubeView } from '../player/player';
import { Button, CategoryBadge, T } from '../ui/components';
import { Icon } from '../ui/Icon';
import { addToPlaylist } from '../ui/menus';
import { shareSong } from '../ui/share';
import { toast } from '../ui/toast';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../ui/icons';
import { Scrubber } from '../ui/Scrubber';
import { ActionBar } from '../ui/list';
import { cardShadow, space, useTheme } from '../ui/theme';

/** The repeat button's name: off → the whole list → this song. */
const REPEAT_LABEL = {
  off: 'בלי חזרה',
  all: 'חזרה על הכול',
  one: 'חזרה על השיר',
} as const;

/** What the toast says after a tap: the button is an icon, so the change is said in words. */
const REPEAT_TOLD = {
  off: 'הניגון ייעצר בסוף הרשימה',
  all: 'הרשימה תתנגן שוב ושוב',
  one: 'השיר יתנגן שוב ושוב',
} as const;

/**
 * Full player: one huge play/pause button with previous, next and repeat around it, a bar to
 * drag through the song, add to a list / share / details, lyrics.
 * A YouTube song shows YouTube's own player at the top (it may only play visibly): the app-wide
 * player (ui/YouTubeHost) is placed over this screen's slot, and shrinks to a small window when
 * she leaves, so the video keeps playing while she browses.
 */
export default function PlayerScreen() {
  const c = useTheme();
  const p = usePlayer();

  useEffect(() => {
    setPlayerScreenOpen(true);
    return () => setPlayerScreenOpen(false);
  }, []);

  if (!p.song) {
    return (
      <View style={styles.center}>
        <T soft>אין שיר שמתנגן</T>
      </View>
    );
  }

  const catId = primaryCategoryId(p.song);
  const atEnd = p.index >= p.queue.length - 1 && p.repeat !== 'all';
  const cat = getCategory(catId);

  const isYoutube = p.song.kind === 'youtube' && !!p.song.youtubeId;
  return (
    <View style={{ flex: 1 }}>
    {isYoutube ? <YouTubeSlot /> : null}
    <ScrollView contentContainerStyle={styles.content}>
      {isYoutube ? null : (
        <View style={[styles.art, { backgroundColor: cat.color + '26' }]}>
          <CategoryBadge id={catId} size={120} />
        </View>
      )}
      <T weight="bold" size={26} style={{ textAlign: 'center' }}>{p.song.title}</T>
      {catId !== UNSORTED_ID ? <T soft style={{ textAlign: 'center' }}>{cat.name}</T> : null}

      {p.error ? (
        <T style={{ color: c.bad, textAlign: 'center' }}>לא הצלחנו לנגן את השיר: {p.error}</T>
      ) : null}

      <View style={{ marginTop: space.l }}>
        <Scrubber position={p.position} duration={p.duration} onSeek={seek} />
      </View>

      {/* Media controls are not mirrored in RTL: previous on the left, next on the right. */}
      <View style={styles.controls}>
        <View style={styles.repeat} />
        <Pressable onPress={() => previous()} accessibilityLabel="שיר קודם / לתחילת השיר" style={[styles.side, { backgroundColor: c.surfaceAlt }]}>
          <PreviousIcon size={20} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => togglePlay()}
          accessibilityLabel={p.playing ? 'השהיה' : 'ניגון'}
          style={[styles.main, { backgroundColor: c.primary }]}
        >
          {p.playing ? <PauseIcon size={34} color={c.primaryInk} /> : <PlayIcon size={34} color={c.primaryInk} />}
        </Pressable>
        <Pressable
          onPress={() => next()}
          disabled={atEnd}
          accessibilityLabel="השיר הבא"
          style={[styles.side, { backgroundColor: c.surfaceAlt, opacity: atEnd ? 0.35 : 1 }]}
        >
          <NextIcon size={20} color={c.ink} />
        </Pressable>
        {/* Repeat sits with the controls, where music apps put it; on, it takes the accent
            colour, and "1" marks repeating this song. */}
        <Pressable
          onPress={() => {
            cycleRepeat();
            toast(REPEAT_TOLD[nextRepeat(p.repeat)], 'info');
          }}
          accessibilityRole="button"
          accessibilityLabel={REPEAT_LABEL[p.repeat]}
          accessibilityHint="מחליף בין בלי חזרה, חזרה על הכול וחזרה על השיר"
          hitSlop={6}
          style={[styles.repeat, { backgroundColor: p.repeat === 'off' ? 'transparent' : c.primarySoft }]}
        >
          <Icon name="repeat" size={24} color={p.repeat === 'off' ? c.inkSoft : c.primary} />
          {p.repeat === 'one' ? (
            <View style={[styles.one, { backgroundColor: c.primary }]}>
              <T weight="bold" size={10} style={{ color: c.primaryInk, lineHeight: 12 }}>1</T>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={{ marginTop: space.xl }}>
        <ActionBar
          actions={[
            { icon: 'list', label: 'לרשימה', onPress: () => addToPlaylist([p.song!.id]) },
            { icon: Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline', label: 'שיתוף', onPress: () => shareSong(p.song!) },
            { icon: 'ellipsis-horizontal', label: 'פרטים', onPress: () => router.push({ pathname: '/song/[id]', params: { id: p.song!.id } }) },
          ]}
        />
      </View>

      {p.song.kind === 'youtube' && p.song.youtubeId ? (
        <Button
          label="פתיחה באפליקציית יוטיוב"
          icon="logo-youtube"
          kind="quiet"
          onPress={() => Linking.openURL(`https://youtu.be/${p.song!.youtubeId}`)}
          style={{ marginTop: space.s }}
        />
      ) : null}

      {p.song.lyrics ? (
        <View style={{ marginTop: space.xl, gap: space.s }}>
          <T weight="bold" size={18}>מילות השיר</T>
          <T style={{ lineHeight: 28, fontSize: 18 }}>{p.song.lyrics}</T>
        </View>
      ) : null}

    </ScrollView>
    </View>
  );
}

/**
 * Where YouTube's player shows on this screen: it reports its place on the window, and
 * ui/YouTubeHost puts the app's one player there (measured again after the screen slides in).
 */
/** How often the slot is measured while the player is on screen. */
const MEASURE_MS = 250;

/** Below the status bar and the header ("חזרה" must stay tappable). */
const HEADER_MIN = 44;

/**
 * Where the app's one YouTube player sits on this screen. Measured again and again while the
 * player is the screen in front: a measurement taken while the screen slides in can be wrong
 * (on the simulator the video then covered the header and its back button). A measurement is
 * used only while the screen is still in front (one arriving after "חזרה" put the video back
 * over the next screen) and only if it looks like the slot: 16:9, below the header. When
 * another screen opens on top (details), the video goes to the small window.
 */
function YouTubeSlot() {
  const ref = useRef<ViewInstance>(null);
  const focused = useRef(false);
  const insets = useSafeAreaInsets();
  const measure = () =>
    ref.current?.measureInWindow((x, y, width, height) => {
      if (!focused.current || width <= 0 || height <= 0) return;
      if (Math.abs(height - (width * 9) / 16) > 3 || y < insets.top + HEADER_MIN) return;
      const f = youtubeView.get().frame;
      if (f && f.x === x && f.y === y && f.width === width && f.height === height) return;
      youtubeView.set({ frame: { x, y, width, height }, closed: false });
    });
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      measure();
      const timer = setInterval(measure, MEASURE_MS);
      return () => {
        focused.current = false;
        clearInterval(timer);
        youtubeView.set({ frame: null });
      };
    }, []),
  );
  return (
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l }}>
      <View ref={ref} onLayout={measure} collapsable={false} style={{ aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#000' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.xl, paddingBottom: 60, gap: space.s },
  art: { alignSelf: 'center', width: 240, height: 240, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.l, ...cardShadow },
  controls: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, marginTop: space.l },
  // 44 + hitSlop, gaps of 8: the five controls (320 pt) fit a 375 pt phone's row.
  repeat: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  one: { position: 'absolute', top: 6, right: 6, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  main: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
