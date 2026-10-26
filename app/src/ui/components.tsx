import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { getCategory } from '../core/categories';
import type { SongWithCategories } from '../core/types';
import { MissingFileError, NotPlayableError, playSong, usePlayer } from '../player/player';
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
  if (song.audioState === 'raw' && !song.playableUri) return 'מכינה לניגון…';
  if (song.status === 'pending') return 'ממתין לשם וקטגוריה';
  if (song.status === 'failed') return 'העיבוד נכשל';
  if (song.status === 'review') return 'ממתין לאישור';
  return null;
}

/** Tap = play now. Long press = open the song screen. */
export async function playOrOpen(song: SongWithCategories, queue: SongWithCategories[]) {
  if (song.kind === 'youtube') {
    router.push({ pathname: '/youtube/[id]', params: { id: song.id } });
    return;
  }
  try {
    Haptics.selectionAsync().catch(() => undefined);
    await playSong(song, queue);
  } catch (e) {
    if (e instanceof NotPlayableError) {
      Alert.alert(
        song.audioState === 'unsupported' ? 'לא ניתן לנגן' : 'עוד רגע',
        song.audioState === 'unsupported' ? 'הפורמט של הקובץ הזה לא נתמך במכשיר.' : 'השיר עדיין בהכנה. הוא יהיה מוכן לניגון בעוד כמה שניות.',
      );
    }
    else if (e instanceof MissingFileError) Alert.alert('לא ניתן לנגן', 'קובץ השמע של השיר חסר. אפשר למחוק את השיר ולשתף אותו שוב.');
    else Alert.alert('לא הצלחנו לנגן', String((e as Error)?.message ?? e));
  }
}

export function SongRow({ song, queue, showCategory = true }: {
  song: SongWithCategories;
  queue: SongWithCategories[];
  showCategory?: boolean;
}) {
  const c = useTheme();
  const player = usePlayer();
  const active = player.song?.id === song.id;
  const catId = song.categories[0]?.categoryId ?? 'unsorted';
  const status = statusLabel(song);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`נגני ${song.title}`}
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
        <T weight="medium" size={18} numberOfLines={1}>{song.title}</T>
        <T soft size={13} numberOfLines={1}>
          {[showCategory ? getCategory(catId).name : null, status].filter(Boolean).join(' · ')}
        </T>
      </View>
      {song.audioState === 'raw' && !song.playableUri ? (
        <ActivityIndicator color={c.inkSoft} />
      ) : (
        <View style={[styles.playDot, { backgroundColor: active && player.playing ? c.primary : c.surfaceAlt }]}>
          <Text style={{ fontSize: 16, color: active && player.playing ? c.primaryInk : c.ink }}>
            {active && player.playing ? '❚❚' : song.kind === 'youtube' ? '▶︎' : '▶︎'}
          </Text>
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
