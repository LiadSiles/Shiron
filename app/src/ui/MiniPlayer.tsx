import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { getCategory, primaryCategoryId } from '../core/categories';
import { next, previous, togglePlay, usePlayer } from '../player/player';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from './icons';
import { CategoryBadge, T } from './components';
import { radius, space, TOUCH, useTheme } from './theme';

/** Always visible above the tab bar while a song is loaded. */
export function MiniPlayer() {
  const c = useTheme();
  const p = usePlayer();
  if (!p.song) return null;
  const catId = primaryCategoryId(p.song);
  const progress = p.duration > 0 ? Math.min(1, p.position / p.duration) : 0;

  return (
    <Pressable
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel={`מתנגן: ${p.song.title}. פתיחת הנגן`}
      style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.line }]}
    >
      <View style={[styles.progress, { backgroundColor: c.primary, width: `${progress * 100}%` }]} />
      <CategoryBadge id={catId} size={40} />
      <View style={{ flex: 1 }}>
        <T weight="medium" numberOfLines={1}>{p.song.title}</T>
        {p.error ? (
          <T size={12} numberOfLines={2} style={{ color: c.bad }}>לא הצלחנו לנגן את השיר: {p.error}</T>
        ) : (
          <T soft size={12} numberOfLines={1}>{getCategory(catId).name}</T>
        )}
      </View>
      {/* Media controls stay left-to-right (not mirrored in RTL): previous, play, next — like
          every player. Previous restarts the song after its first seconds, as in the full player. */}
      <View style={styles.controls}>
        <Pressable onPress={() => previous()} accessibilityLabel="השיר הקודם" hitSlop={4} style={[styles.btn, { backgroundColor: c.surfaceAlt }]}>
          <PreviousIcon size={14} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => togglePlay()}
          accessibilityLabel={p.playing ? 'השהיה' : 'ניגון'}
          hitSlop={4}
          style={[styles.btn, { backgroundColor: c.primary }]}
        >
          {p.playing ? <PauseIcon size={16} color={c.primaryInk} /> : <PlayIcon size={16} color={c.primaryInk} />}
        </Pressable>
        {p.index < p.queue.length - 1 || (p.repeat === 'all' && p.queue.length > 1) ? (
          <Pressable onPress={() => next()} accessibilityLabel="השיר הבא" hitSlop={4} style={[styles.btn, { backgroundColor: c.surfaceAlt }]}>
            <NextIcon size={14} color={c.ink} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginHorizontal: space.s,
    marginBottom: space.s,
    padding: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  progress: { position: 'absolute', top: 0, start: 0, height: 3 },
  controls: { direction: 'ltr', flexDirection: 'row', gap: space.xs },
  btn: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
