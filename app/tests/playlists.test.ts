import { describe, expect, it } from 'vitest';
import { addSongs, cleanName, MAX_NAME, moveSong, newPlaylistName, playlistSongs, songCount, toggleSong, toggleSongs, playlistColor } from '../src/core/playlists';

describe('playlists', () => {
  it('cleans names', () => {
    expect(cleanName('  מעגל   בוקר \n')).toBe('מעגל בוקר');
    expect(cleanName('   ')).toBe('');
    expect(cleanName('א'.repeat(60))).toHaveLength(MAX_NAME);
  });

  it('picks a free name for a new list', () => {
    expect(newPlaylistName([])).toBe('רשימה חדשה');
    expect(newPlaylistName(['רשימה חדשה'])).toBe('רשימה חדשה 2');
    expect(newPlaylistName(['רשימה חדשה', 'רשימה חדשה 2', 'מעגל בוקר'])).toBe('רשימה חדשה 3');
  });

  it('adds and removes songs, each at most once', () => {
    expect(toggleSong(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleSong(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    // Several selected songs: add the missing ones; all there already → take them all out.
    expect(toggleSongs(['a', 'b'], ['b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleSongs(['a', 'b', 'c'], ['c', 'a'])).toEqual(['b']);
    expect(addSongs(['a'], ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('moves a song up and down', () => {
    expect(moveSong(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveSong(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    const same = ['a', 'b'];
    expect(moveSong(same, 0, -1)).toBe(same);
    expect(moveSong(same, 1, 2)).toBe(same);
  });

  it('keeps her order and drops deleted songs', () => {
    const byId = new Map([['a', 'A'], ['c', 'C']]);
    expect(playlistSongs(['c', 'b', 'a'], byId)).toEqual(['C', 'A']);
  });

  it('counts songs in Hebrew', () => {
    expect(songCount(1)).toBe('שיר אחד');
    expect(songCount(0)).toBe('0 שירים');
    expect(songCount(7)).toBe('7 שירים');
  });
});

describe('a list’s colour', () => {
  it('is its own, the same every time', () => {
    expect(playlistColor('abc')).toBe(playlistColor('abc'));
    expect(playlistColor('abc')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
