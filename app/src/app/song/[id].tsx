import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { CATEGORIES } from '../../core/categories';
import { formatTime } from '../../core/time';
import type { SongWithCategories } from '../../core/types';
import { deleteSong, getSong, onLibraryChange, setCategories, updateSong } from '../../db/repo';
import { retrySong } from '../../ingest/processor';
import { deleteStored, resolveStored } from '../../ingest/storage';
import { clearIfCurrent } from '../../player/player';
import { Button, CategoryBadge, playOrOpen, statusLabel, T } from '../../ui/components';
import { toast } from '../../ui/toast';
import { font, radius, space, useTheme } from '../../ui/theme';

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const [song, setSong] = useState<SongWithCategories | null>(null);
  const [title, setTitle] = useState('');
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [lyrics, setLyrics] = useState('');

  useEffect(() => {
    const load = () =>
      getSong(id).then((s) => {
        setSong(s);
        if (s) {
          setTitle((t) => (t ? t : s.title));
          setLyrics((l) => (l ? l : s.lyrics ?? ''));
        }
      });
    load();
    return onLibraryChange(load);
  }, [id]);

  if (!song) return null;

  const selected = song.categories.map((x) => x.categoryId);

  const saveTitle = async () => {
    const t = title.trim();
    if (!t || t === song.title) return;
    await updateSong(song.id, { title: t, titleSource: 'user' });
    toast('השם נשמר');
  };

  const toggleCategory = async (catId: string) => {
    const next = selected.includes(catId) ? selected.filter((x) => x !== catId) : [...selected, catId];
    await setCategories(song.id, next.map((cid) => ({ id: cid, confidence: 1, confirmed: true })));
  };

  const togglePin = () => updateSong(song.id, { pinnedAt: song.pinnedAt ? null : Date.now() });

  const saveLyrics = async () => {
    await updateSong(song.id, { lyrics: lyrics.trim() || null });
    setEditingLyrics(false);
  };

  const remove = () =>
    Alert.alert('למחוק את השיר?', song.title, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: async () => {
          await clearIfCurrent(song.id);
          deleteStored(song.originalUri, song.playableUri);
          await deleteSong(song.id);
          router.back();
        },
      },
    ]);

  const status = statusLabel(song);

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <T soft size={13}>שם השיר</T>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        onSubmitEditing={saveTitle}
        returnKeyType="done"
        accessibilityLabel="שם השיר"
        style={[styles.titleInput, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.bold }]}
      />
      {status ? <T soft size={14} style={{ marginTop: space.xs }}>{status}</T> : null}

      <View style={styles.actions}>
        <Button label="ניגון" icon="▶︎" onPress={() => playOrOpen(song, [song])} style={{ flex: 1 }} />
        <Button label={song.pinnedAt ? 'בטל הצמדה' : 'הצמדה'} icon="📌" kind="quiet" onPress={togglePin} style={{ flex: 1 }} />
      </View>
      {song.status === 'pending' || song.error ? (
        <Button label="לעבד שוב" kind="quiet" icon="↻" onPress={() => retrySong(song.id)} style={{ marginTop: space.s }} />
      ) : null}

      <T weight="bold" size={18} style={styles.h}>קטגוריות</T>
      <View style={[styles.chips, { marginBottom: space.s }]}>
        {CATEGORIES.map((cat) => {
          const on = selected.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              onPress={() => toggleCategory(cat.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.chip, { backgroundColor: on ? cat.color + '33' : c.surfaceAlt, borderColor: on ? cat.color : 'transparent' }]}
            >
              <CategoryBadge id={cat.id} size={24} />
              <T size={14} weight={on ? 'medium' : 'regular'}>{cat.name}</T>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.lyricsHeader]}>
        <T weight="bold" size={18} style={{ flex: 1 }}>מילות השיר</T>
        <Pressable onPress={() => (editingLyrics ? saveLyrics() : setEditingLyrics(true))} hitSlop={10}>
          <T weight="medium" style={{ color: c.primary }}>{editingLyrics ? 'שמירה' : 'עריכה'}</T>
        </Pressable>
      </View>
      {editingLyrics ? (
        <TextInput
          value={lyrics}
          onChangeText={setLyrics}
          multiline
          style={[styles.lyricsInput, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.regular }]}
        />
      ) : (
        <T style={{ lineHeight: 26 }} soft={!song.lyrics}>
          {song.lyrics ?? (song.status === 'pending' ? 'המילים יופיעו אחרי העיבוד.' : 'אין מילים. אפשר להוסיף ידנית.')}
        </T>
      )}

      <T weight="bold" size={18} style={styles.h}>מקור</T>
      {song.sourceName ? <T soft size={14}>קובץ: {song.sourceName}</T> : null}
      {song.durationSec ? <T soft size={14}>אורך: {formatTime(song.durationSec)}</T> : null}
      {song.contextText ? <T soft size={14}>נשלח עם ההודעה: “{song.contextText}”</T> : null}
      {song.summary ? <T soft size={14}>תקציר: {song.summary}</T> : null}

      <TechDetails song={song} />

      <Button label="מחיקת השיר" kind="quiet" onPress={remove} style={{ marginTop: space.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  titleInput: { fontSize: 22, borderWidth: 1, borderRadius: radius.m, padding: space.m, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.l },
  h: { marginTop: space.xl, marginBottom: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: space.m, borderRadius: radius.l, borderWidth: 1.5, minHeight: 40 },
  lyricsHeader: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, marginBottom: space.s },
  lyricsInput: { minHeight: 200, borderWidth: 1, borderRadius: radius.m, padding: space.m, fontSize: 16, textAlignVertical: 'top' },
});

/** Collapsed by default: what the app knows about this song's files — for screenshots when something fails. */
function TechDetails({ song }: { song: SongWithCategories }) {
  const [open, setOpen] = useState(false);
  const c = useTheme();
  const fileLine = (label: string, stored: string | null) => {
    if (!stored) return `${label}: —`;
    try {
      const f = resolveStored(stored);
      return `${label}: ${f.name} · ${f.exists ? `${Math.round((f.size ?? 0) / 1024)} KB` : 'חסר!'}`;
    } catch (e) {
      return `${label}: ${stored} (${String(e)})`;
    }
  };
  const rows = [
    `שמע: ${song.audioState} · AI: ${song.status}`,
    song.error ? `שגיאה: ${song.error}` : null,
    fileLine('לניגון', song.playableUri),
    fileLine('מקור', song.originalUri),
    `אורך: ${song.durationSec ? `${song.durationSec.toFixed(1)} s` : '—'}`,
    `קובץ ששותף: ${song.sourceName ?? '—'}`,
    `נוסף: ${new Date(song.createdAt).toLocaleString('he-IL')}`,
    `מזהה: ${song.id}`,
  ].filter(Boolean) as string[];
  return (
    <View style={{ marginTop: space.xl }}>
      <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
        <T weight="medium" style={{ color: c.inkSoft }}>{open ? '▾' : '◂'} פרטים טכניים</T>
      </Pressable>
      {open ? (
        <View style={{ marginTop: space.s, gap: 2 }}>
          {rows.map((r) => (
            <T key={r} soft size={13} selectable style={{ writingDirection: 'rtl' }}>{r}</T>
          ))}
        </View>
      ) : null}
    </View>
  );
}
