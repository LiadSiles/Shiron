import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { getCategory } from '../core/categories';
import { isPreparing } from '../core/ingestRules';
import { highlight } from '../core/search';
import type { SongWithCategories } from '../core/types';
import { MissingFileError, NotPlayableError, playOrToggle, playSong, usePlayer } from '../player/player';
import { PauseIcon, PlayIcon } from './icons';
import { font, radius, space, TOUCH, useTheme } from './theme';

export function T({ style, weight = 'regular', size = 16, soft, ...rest }: TextProps & {
  weight?: 'regular' | 'medium' | 'bold';
  size?: number;
  soft?: boolean;
}) {
  const c = useTheme();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: font[weight], fontSize: size, color: soft ? c.inkSoft : c.ink }, style]}
    />
  );
}

export function Button({ label, onPress, kind = 'primary', icon, style, disabled }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet';
  icon?: string;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const c = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? c.primary : c.surfaceAlt, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {icon ? <Text style={styles.buttonIcon}>{icon}</Text> : null}
      <T weight="medium" style={{ color: primary ? c.primaryInk : c.ink }}>{label}</T>
    </Pressable>
  );
}

/** The emoji tile that identifies a category before the name is read. */
export function CategoryBadge({ id, size = 44 }: { id: string; size?: number }) {
  const cat = getCategory(id);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 3, backgroundColor: cat.color + '2E' }]}>
      <Text style={{ fontSize: size * 0.5 }}>{cat.icon}</Text>
    </View>
  );
}

export function statusLabel(song: SongWithCategories): string | null {
  if (song.kind === 'youtube') return song.status === 'pending' ? 'יוטיוב · ממתין לשם וקטגוריה' : 'יוטיוב';
  if (song.audioState === 'unsupported' && !song.playableUri) return song.error ?? 'הפורמט לא נתמך במכשיר הזה';
  if (isPreparing(song)) return 'מכינה לניגון…';
  if (song.status === 'pending') return 'ממתין לשם וקטגוריה';
  return null;
}

/** Tap = play now (or pause, if it is the song playing). YouTube songs open their screen. */
export function playOrOpen(song: SongWithCategories, queue: SongWithCategories[]) {
  if (song.kind === 'youtube') {
    router.push({ pathname: '/youtube/[id]', params: { id: song.id } });
    return Promise.resolve();
  }
  Haptics.selectionAsync().catch(() => undefined);
  return explainPlayErrors(song, () => playOrToggle(song, queue));
}

/** "נגני הכול": always starts the first song, even if it is the one playing. */
export function playAll(queue: SongWithCategories[]) {
  const first = queue[0];
  return first ? explainPlayErrors(first, () => playSong(first, queue)) : Promise.resolve();
}

async function explainPlayErrors(song: SongWithCategories, play: () => Promise<void>) {
  try {
    await play();
  } catch (e) {
    if (e instanceof NotPlayableError) {
      const unsupported = song.audioState === 'unsupported';
      Alert.alert(
        unsupported ? 'לא ניתן לנגן' : 'עוד רגע',
        unsupported ? 'הפורמט של הקובץ הזה לא נתמך במכשיר.' : 'השיר עדיין בהכנה. הוא יהיה מוכן לניגון בעוד כמה שניות.',
      );
    } else if (e instanceof MissingFileError) {
      Alert.alert('לא ניתן לנגן', 'קובץ השמע של השיר חסר. אפשר למחוק את השיר ולשתף אותו שוב.');
    } else {
      Alert.alert('לא הצלחנו לנגן', String((e as Error)?.message ?? e));
    }
  }
}

/** Text with the words matching a search in bold and the accent colour. */
export function Highlighted({ text, query, ...props }: React.ComponentProps<typeof T> & { text: string; query?: string }) {
  const c = useTheme();
  if (!query) return <T {...props}>{text}</T>;
  return (
    <T {...props}>
      {highlight(text, query).map((seg, i) =>
        seg.hit ? (
          <T key={i} weight="bold" size={props.size} style={{ color: c.primary }}>{seg.text}</T>
        ) : (
          seg.text
        ),
      )}
    </T>
  );
}

export function SongRow({ song, queue, showCategory = true, query }: {
  song: SongWithCategories;
  queue: SongWithCategories[];
  showCategory?: boolean;
  /** Search text: matching words in the title are highlighted. */
  query?: string;
}) {
  const c = useTheme();
  const player = usePlayer();
  const active = player.song?.id === song.id;
  const catId = song.categories[0]?.categoryId ?? 'unsorted';
  const status = statusLabel(song);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active && player.playing ? `השהיית ${song.title}` : `נגני ${song.title}`}
      accessibilityHint="לחיצה ארוכה פותחת את פרטי השיר"
      onPress={() => playOrOpen(song, queue)}
      onLongPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: active ? c.primarySoft : pressed ? c.surfaceAlt : c.surface, borderColor: c.line },
      ]}
    >
      <CategoryBadge id={catId} />
      <View style={{ flex: 1, gap: 2 }}>
        <Highlighted weight="medium" size={18} numberOfLines={1} text={song.title} query={query} />
        <T soft size={13} numberOfLines={1}>
          {[showCategory ? getCategory(catId).name : null, status].filter(Boolean).join(' · ')}
        </T>
      </View>
      {isPreparing(song) ? (
        <ActivityIndicator color={c.inkSoft} />
      ) : (
        <View style={[styles.playDot, { backgroundColor: active && player.playing ? c.primary : c.surfaceAlt }]}>
          {active && player.playing ? <PauseIcon size={16} color={c.primaryInk} /> : <PlayIcon size={16} color={c.ink} />}
        </View>
      )}
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, children }: {
  icon: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 56 }}>{icon}</Text>
      <T weight="bold" size={20} style={{ textAlign: 'center' }}>{title}</T>
      <T soft style={{ textAlign: 'center', lineHeight: 22 }}>{body}</T>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <T weight="bold" size={20} style={{ marginTop: space.xl, marginBottom: space.s }}>
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
  buttonIcon: { fontSize: 18 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    minHeight: 64,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.s,
  },
  playDot: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.m, paddingVertical: space.xxl, paddingHorizontal: space.xl },
});
