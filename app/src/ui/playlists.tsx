import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { textOn } from '../core/color';
import { playlistSongs, songCount } from '../core/playlists';
import type { Playlist, SongWithCategories } from '../core/types';
import { togglePlay, usePlayerSelect } from '../player/player';
import { playAll, T } from './components';
import { Icon } from './Icon';
import { PauseIcon, PlayIcon } from './icons';
import { radius, space, TOUCH, useTheme } from './theme';

/** Each list keeps its own colour (picked from its id), distinct from the categories' palette. */
const COLORS = ['#5B4FC4', '#2E7D8C', '#B5447A', '#3F7D3A', '#A65A2A', '#4A6FB5'];

export function playlistColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/** What can actually start: audio that's ready, and YouTube songs (they play in the full player). */
export function playableOf(songs: SongWithCategories[]): SongWithCategories[] {
  return songs.filter((s) => s.kind === 'youtube' || !!s.playableUri);
}

export function openPlaylist(id: string) {
  router.push({ pathname: '/playlist/[id]', params: { id } });
}

/** New list: name it and pick its songs in one screen. */
export function newPlaylist() {
  router.push('/playlist/pick');
}

/**
 * Home: her lists as a row of cards. The round button plays the whole list at once, so a list
 * is one tap from opening the app; tapping the card opens it.
 */
export function PlaylistStrip({ playlists, byId }: { playlists: Playlist[]; byId: Map<string, SongWithCategories> }) {
  const c = useTheme();
  const playingId = usePlayerSelect((s) => (s.playing ? s.song?.id ?? null : null));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {playlists.map((p) => {
        const songs = playableOf(playlistSongs(p.songIds, byId));
        const color = playlistColor(p.id);
        const ink = textOn(color);
        const playingThis = !!playingId && p.songIds.includes(playingId);
        return (
          <Pressable
            key={p.id}
            onPress={() => openPlaylist(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`רשימה ${p.name}, ${songCount(p.songIds.length)}`}
            style={({ pressed }) => [styles.card, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name="list" size={22} color={ink} />
            <T weight="bold" size={17} numberOfLines={2} style={{ color: ink, marginTop: space.xs }}>{p.name}</T>
            <T size={13} style={{ color: ink, opacity: 0.85 }}>{songCount(p.songIds.length)}</T>
            {songs.length ? (
              <Pressable
                onPress={() => (playingThis ? togglePlay() : playAll(songs))}
                accessibilityRole="button"
                accessibilityLabel={playingThis ? `השהיית ${p.name}` : `נגני את ${p.name}`}
                hitSlop={8}
                style={[styles.play, { backgroundColor: ink }]}
              >
                {playingThis ? <PauseIcon size={18} color={color} /> : <PlayIcon size={18} color={color} />}
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
      <Pressable
        onPress={newPlaylist}
        accessibilityRole="button"
        accessibilityLabel="רשימה חדשה"
        style={({ pressed }) => [styles.card, styles.add, { borderColor: c.line, backgroundColor: pressed ? c.surfaceAlt : c.surface }]}
      >
        <Icon name="add-circle" size={36} color={c.primary} />
        <T weight="medium" style={{ textAlign: 'center' }}>רשימה חדשה</T>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.m, paddingVertical: space.xs },
  card: { width: 150, height: 150, borderRadius: radius.m, padding: space.m, overflow: 'hidden' },
  add: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.s },
  play: {
    position: 'absolute',
    bottom: space.m,
    end: space.m,
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
