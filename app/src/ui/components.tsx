import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { getCategory, primaryCategoryId, UNSORTED_ID } from '../core/categories';
import { isPreparing } from '../core/ingestRules';
import { highlight } from '../core/search';
import type { SongWithCategories } from '../core/types';
import { usePlayerSelect } from '../player/player';
import { showSongMenu, SongMenuContext } from './menus';
import { playOrOpen } from './play';
import { T } from './text';
import { Icon, IconName } from './Icon';
import { PauseIcon, PlayIcon } from './icons';
import { radius, space, TOUCH, useTheme } from './theme';
import { useAiConnected } from './useAiConnected';

export { T } from './text';
export { playAll, playOrOpen } from './play';

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
      // Its own label: otherwise iOS reads the icon's font glyph before the words.
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
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

/**
 * The song's state in a few words, or null when there is nothing to say. "Waiting for a name"
 * only while an AI service is connected (`ai`): without one, nothing is on its way.
 */
export function statusLabel(song: SongWithCategories, ai: boolean | null): string | null {
  const waiting = song.status === 'pending' && ai !== false;
  if (song.kind === 'youtube') return waiting ? 'יוטיוב · ממתין לשם וקטגוריה' : 'יוטיוב';
  if (song.audioState === 'unsupported' && !song.playableUri) return song.error ?? 'הפורמט לא נתמך במכשיר הזה';
  if (isPreparing(song)) return 'מכינה לניגון…';
  return waiting ? 'ממתין לשם וקטגוריה' : null;
}

/**
 * What a song row or tile does besides playing. `menu`: what its long press / ⋮ sheet offers
 * here (ui/menus). `select`: the screen is selecting several songs — a tap (or a long press)
 * checks or unchecks this one, nothing plays, and a check circle takes the badge's place.
 */
export interface SongItemMode {
  menu?: Omit<SongMenuContext, 'queue'>;
  select?: { selected: boolean; onToggle: () => void } | null;
}

/** A row's second line: the category (not "לא מסווג", which says nothing) and the state. */
function rowDetails(song: SongWithCategories, showCategory: boolean, ai: boolean | null): string {
  const catId = primaryCategoryId(song);
  return [showCategory && catId !== UNSORTED_ID ? getCategory(catId).name : null, statusLabel(song, ai)].filter(Boolean).join(' · ');
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

export function SongRow({ song, queue, showCategory = true, query, menu, select }: {
  song: SongWithCategories;
  queue: SongWithCategories[];
  showCategory?: boolean;
  /** Search text: matching words in the title are highlighted. */
  query?: string;
} & SongItemMode) {
  const c = useTheme();
  // Only "is this the song, and is it playing" — not every position tick.
  const mine = usePlayerSelect((p) => (p.song?.id !== song.id ? 'other' : p.playing ? 'playing' : 'paused'));
  const active = mine !== 'other';
  const playing = mine === 'playing';
  const catId = primaryCategoryId(song);
  const details = rowDetails(song, showCategory, useAiConnected());
  return (
    <Pressable
      {...itemPress(song, queue, menu, select, playing)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: select?.selected || (active && !select) ? c.primarySoft : pressed ? c.surfaceAlt : c.surface,
          borderColor: select?.selected ? c.primary : c.line,
        },
      ]}
    >
      {/* Selecting: a check circle. The song playing shows a pause button in place of its
          category; any other row a badge. */}
      {select ? (
        <CheckCircle checked={select.selected} />
      ) : active ? (
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
        <View style={styles.titleLine}>
          <Highlighted
            weight={active ? 'bold' : 'medium'}
            size={18}
            numberOfLines={1}
            text={song.title}
            query={query}
            style={[{ flexShrink: 1 }, active ? { color: c.primary } : null]}
          />
          {song.pinnedAt ? <Icon name="pin" size={14} color={c.primary} /> : null}
        </View>
        {details ? <T soft size={13} numberOfLines={1}>{details}</T> : null}
      </View>
      {select ? null : (
        <Pressable
          onPress={() => showSongMenu(song, { queue, ...menu })}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`אפשרויות: ${song.title}`}
          style={({ pressed }) => [styles.more, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}
        >
          <Icon name="ellipsis-vertical" size={20} color={c.inkSoft} />
        </Pressable>
      )}
    </Pressable>
  );
}

/**
 * A song as a square tile (the "tiles" layout): its category's colour and emoji, the title.
 * Tap = play / pause, long press or ⋮ = its actions, like SongRow.
 */
export function SongTile({ song, queue, size, menu, select }: {
  song: SongWithCategories;
  queue: SongWithCategories[];
  size: number;
} & SongItemMode) {
  const c = useTheme();
  const mine = usePlayerSelect((p) => (p.song?.id !== song.id ? 'other' : p.playing ? 'playing' : 'paused'));
  const active = mine !== 'other';
  const cat = getCategory(primaryCategoryId(song));
  const details = rowDetails(song, true, useAiConnected());
  return (
    <Pressable
      {...itemPress(song, queue, menu, select, mine === 'playing')}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: active && !select ? c.primarySoft : cat.color + '26',
          borderColor: select?.selected || (active && !select) ? c.primary : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.tileTop}>
        {select ? (
          <CheckCircle checked={select.selected} />
        ) : active ? (
          <View style={[styles.tileLead, { backgroundColor: c.primary }]}>
            {mine === 'playing' ? <PauseIcon size={16} color={c.primaryInk} /> : <PlayIcon size={16} color={c.primaryInk} />}
          </View>
        ) : isPreparing(song) ? (
          <ActivityIndicator color={c.inkSoft} />
        ) : (
          <Text style={{ fontSize: size * 0.22 }}>{cat.icon}</Text>
        )}
        {select ? null : (
          <Pressable
            onPress={() => showSongMenu(song, { queue, ...menu })}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`אפשרויות: ${song.title}`}
            style={styles.tileMore}
          >
            <Icon name="ellipsis-vertical" size={18} color={c.inkSoft} />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <T weight="bold" size={16} numberOfLines={3} style={active ? { color: c.primary } : undefined}>{song.title}</T>
        {details ? <T soft size={12} numberOfLines={1}>{details}</T> : null}
      </View>
    </Pressable>
  );
}

/** A row's or tile's taps: play / open its sheet, or — selecting — check it. */
function itemPress(
  song: SongWithCategories,
  queue: SongWithCategories[],
  menu: SongItemMode['menu'],
  select: SongItemMode['select'],
  playing: boolean,
) {
  if (select) {
    return {
      accessibilityRole: 'checkbox' as const,
      accessibilityState: { checked: select.selected },
      accessibilityLabel: song.title,
      onPress: select.onToggle,
      onLongPress: select.onToggle,
    };
  }
  return {
    accessibilityRole: 'button' as const,
    accessibilityLabel: playing ? `השהיית ${song.title}` : `נגני ${song.title}`,
    accessibilityHint: 'לחיצה ארוכה פותחת את האפשרויות',
    onPress: () => playOrOpen(song, queue),
    onLongPress: () => showSongMenu(song, { queue, ...menu }),
  };
}

/** Selected or not, in selection mode: a filled circle with a tick, or an empty ring. */
export function CheckCircle({ checked }: { checked: boolean }) {
  const c = useTheme();
  return (
    <View
      style={[
        styles.check,
        checked ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.surface, borderColor: c.inkSoft },
      ]}
    >
      {checked ? <Icon name="checkmark" size={20} color={c.primaryInk} /> : null}
    </View>
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
  tile: { borderRadius: radius.m, padding: space.m, borderWidth: 2, overflow: 'hidden' },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileLead: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tileMore: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginEnd: -8 },
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
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', margin: 10 },
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
