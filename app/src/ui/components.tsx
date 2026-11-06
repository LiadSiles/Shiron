import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { getCategory } from '../core/categories';
import { isPreparing } from '../core/ingestRules';
import { highlight } from '../core/search';
import type { SongWithCategories } from '../core/types';
import { MissingFileError, NotPlayableError, playOrToggle, playSong, usePlayerSelect } from '../player/player';
import { Icon, IconName } from './Icon';
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
  icon?: IconName;
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
      {icon ? <Icon name={icon} size={20} color={primary ? c.primaryInk : c.ink} /> : null}
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

/** Tap = play now (or pause, if it is the song playing). A YouTube song opens the full player. */
export function playOrOpen(song: SongWithCategories, queue: SongWithCategories[]) {
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
  // Only "is this the song, and is it playing" — not every position tick.
  const mine = usePlayerSelect((p) => (p.song?.id !== song.id ? 'other' : p.playing ? 'playing' : 'paused'));
  const active = mine !== 'other';
  const playing = mine === 'playing';
  const catId = song.categories[0]?.categoryId ?? 'unsorted';
  const status = statusLabel(song);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? `השהיית ${song.title}` : `נגני ${song.title}`}
      accessibilityHint="לחיצה ארוכה או ⋮ פותחים את פרטי השיר"
      onPress={() => playOrOpen(song, queue)}
      onLongPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: active ? c.primarySoft : pressed ? c.surfaceAlt : c.surface, borderColor: c.line },
      ]}
    >
      {/* The song playing shows a pause button in place of its category; any other row a badge. */}
      {active ? (
        <View style={[styles.lead, { backgroundColor: c.primary }]}>
          {playing ? <PauseIcon size={18} color={c.primaryInk} /> : <PlayIcon size={18} color={c.primaryInk} />}
        </View>
      ) : isPreparing(song) ? (
        <View style={[styles.lead, { backgroundColor: c.surfaceAlt }]}>
          <ActivityIndicator color={c.inkSoft} />
        </View>
      ) : (
        <CategoryBadge id={catId} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Highlighted
          weight={active ? 'bold' : 'medium'}
          size={18}
          numberOfLines={1}
          text={song.title}
          query={query}
          style={active ? { color: c.primary } : undefined}
        />
        <T soft size={13} numberOfLines={1}>
          {[showCategory ? getCategory(catId).name : null, status].filter(Boolean).join(' · ')}
        </T>
      </View>
      {song.pinnedAt ? <Icon name="pin" size={16} color={c.inkSoft} /> : null}
      <Pressable
        onPress={() => router.push({ pathname: '/song/[id]', params: { id: song.id } })}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`פרטים ואפשרויות: ${song.title}`}
        style={({ pressed }) => [styles.more, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
      >
        <Icon name="ellipsis-vertical" size={20} color={c.inkSoft} />
      </Pressable>
    </Pressable>
  );
}

/** An empty list: a large friendly icon in a soft circle, a title, and what to do. */
export function EmptyState({ icon, emoji, title, body, children }: {
  icon?: IconName;
  /** A category's own emoji instead of an icon. */
  emoji?: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
        {emoji ? <Text style={{ fontSize: 44 }}>{emoji}</Text> : <Icon name={icon ?? 'musical-notes'} size={44} color={c.primary} />}
      </View>
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
  lead: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  more: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center', marginEnd: -space.s },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.m, paddingVertical: space.xxl, paddingHorizontal: space.xl },
});
