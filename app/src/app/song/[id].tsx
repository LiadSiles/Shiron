import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { connectedProviders } from '../../api/keys';
import { allCategories, UNSORTED_ID } from '../../core/categories';
import { canTranscribe } from '../../core/ingestRules';
import { formatTime } from '../../core/time';
import type { SongWithCategories } from '../../core/types';
import { getSong, onLibraryChange, setCategories, updateSong } from '../../db/repo';
import { retrySong } from '../../ingest/processor';
import { resolveStored } from '../../ingest/storage';
import { CategoryBadge, playOrOpen, statusLabel, T } from '../../ui/components';
import { ActionBar, ListGroup, ListItem } from '../../ui/list';
import { Icon } from '../../ui/Icon';
import { addToPlaylist, confirmDeleteSongs } from '../../ui/menus';
import { shareSong } from '../../ui/share';
import { useAiConnected } from '../../ui/useAiConnected';
import { toast } from '../../ui/toast';
import { font, radius, space, useTheme } from '../../ui/theme';

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const [song, setSong] = useState<SongWithCategories | null>(null);
  const [title, setTitle] = useState('');
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const ai = useAiConnected();
  const [allShown, setAllShown] = useState(false);

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
    if (!t) {
      setTitle(song.title); // an emptied name isn't saved: show the one the song still has
      return;
    }
    if (t === song.title) return;
    await updateSong(song.id, { title: t, titleSource: 'user' });
    toast('השם נשמר', 'success');
  };

  const toggleCategory = async (catId: string) => {
    const next = selected.includes(catId) ? selected.filter((x) => x !== catId) : [...selected, catId];
    await setCategories(song.id, next.map((cid) => ({ id: cid, confidence: 1, confirmed: true })));
  };

  /**
   * Runs the AI step again: new lyrics, summary and keywords (and a new name and category,
   * unless she set them herself — her choices are kept).
   */
  const transcribeAgain = async () => {
    const connected = await connectedProviders();
    if (!connected.length) {
      Alert.alert('אין שירות AI מחובר', 'כדי לתמלל צריך לחבר שירות AI חינמי (פעם אחת, כשתי דקות).', [
        { text: 'ביטול', style: 'cancel' },
        { text: 'לחיבור', onPress: () => router.push('/connect') },
      ]);
      return;
    }
    const run = () => {
      retrySong(song.id);
      toast(song.kind === 'youtube' && !connected.includes('gemini')
        ? 'בלי Gemini, שירי יוטיוב מקבלים רק שם מהכותרת, בלי מילים'
        : 'מתמללת מחדש…');
    };
    if (!song.lyrics) return run();
    Alert.alert('לתמלל מחדש?', 'המילים הנוכחיות יוחלפו בתמלול החדש.', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'תמלול מחדש', onPress: run },
    ]);
  };

  const togglePin = () => updateSong(song.id, { pinnedAt: song.pinnedAt ? null : Date.now() });

  const saveLyrics = async () => {
    await updateSong(song.id, { lyrics: lyrics.trim() || null });
    setEditingLyrics(false);
  };

  const remove = () => confirmDeleteSongs([song], () => router.back());

  const status = statusLabel(song, ai);
  const chosen = selected.filter((x) => x !== UNSORTED_ID);
  const collapsed = !allShown && chosen.length > 0;
  const shownCategories = collapsed
    ? allCategories().filter((cat) => chosen.includes(cat.id))
    : [...allCategories().filter((cat) => chosen.includes(cat.id)), ...allCategories().filter((cat) => !chosen.includes(cat.id))];

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <CategoryBadge id={selected[0] ?? 'unsorted'} size={64} />
        <View style={{ flex: 1 }}>
          <View style={[styles.titleBox, { borderColor: c.line, backgroundColor: c.surface }]}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={saveTitle}
              onSubmitEditing={saveTitle}
              returnKeyType="done"
              accessibilityLabel="שם השיר"
              clearButtonMode="while-editing"
              style={[styles.titleInput, { color: c.ink, fontFamily: font.bold }]}
            />
            <Icon name="pencil" size={16} color={c.inkSoft} />
          </View>
          {status ? <T soft size={14} style={{ marginTop: space.xs }}>{status}</T> : null}
        </View>
      </View>
      {song.error ? <T size={14} style={{ marginTop: space.s, color: c.warn }}>{song.error}</T> : null}

      <View style={{ marginTop: space.l }}>
        <ActionBar
          actions={[
            { icon: 'play', label: 'ניגון', primary: true, onPress: () => playOrOpen(song, [song]) },
            { icon: song.pinnedAt ? 'pin' : 'pin-outline', label: song.pinnedAt ? 'מוצמד' : 'הצמדה', active: !!song.pinnedAt, onPress: togglePin },
            { icon: 'list', label: 'לרשימה', onPress: () => addToPlaylist([song.id]) },
            { icon: Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline', label: 'שיתוף', onPress: () => shareSong(song) },
          ]}
        />
      </View>

      <T weight="bold" size={18} style={styles.h}>קטגוריות</T>
      {/* Her chosen categories first; the other thirty-odd only when she asks for them (or
          when the song has none yet, the moment she needs them). */}
      <View style={[styles.chips, { marginBottom: space.s }]}>
        {shownCategories.map((cat) => {
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
        {collapsed ? (
          <Pressable
            onPress={() => setAllShown(true)}
            accessibilityRole="button"
            style={[styles.chip, { backgroundColor: c.surfaceAlt, borderColor: 'transparent' }]}
          >
            <Icon name="chevron-down" size={18} color={c.ink} />
            <T size={14} weight="medium">כל הקטגוריות</T>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push({ pathname: '/category/edit', params: { song: song.id } })}
          accessibilityRole="button"
          style={[styles.chip, { backgroundColor: c.surface, borderColor: c.primary, borderStyle: 'dashed' }]}
        >
          <Icon name="add" size={20} color={c.primary} />
          <T size={14} weight="medium" style={{ color: c.primary }}>קטגוריה חדשה</T>
        </Pressable>
      </View>

      <View style={[styles.lyricsHeader]}>
        <T weight="bold" size={18} style={{ flex: 1 }}>מילות השיר</T>
        <Pressable
          onPress={() => (editingLyrics ? saveLyrics() : setEditingLyrics(true))}
          hitSlop={10}
          accessibilityRole="button"
          style={[styles.pill, { backgroundColor: editingLyrics ? c.primary : c.surfaceAlt }]}
        >
          <Icon name={editingLyrics ? 'checkmark' : 'create-outline'} size={16} color={editingLyrics ? c.primaryInk : c.ink} />
          <T weight="medium" size={14} style={{ color: editingLyrics ? c.primaryInk : c.ink }}>{editingLyrics ? 'שמירה' : 'עריכה'}</T>
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

      {song.sourceName || song.durationSec || song.contextText || song.summary ? (
        <>
          <T weight="bold" size={18} style={styles.h}>מקור</T>
          <View style={{ gap: 4 }}>
            {song.sourceName ? <T soft size={14}>קובץ: {song.sourceName}</T> : null}
            {song.durationSec ? <T soft size={14}>אורך: {formatTime(song.durationSec)}</T> : null}
            {song.contextText ? <T soft size={14}>נשלח עם ההודעה: “{song.contextText}”</T> : null}
            {song.summary ? <T soft size={14}>תקציר: {song.summary}</T> : null}
          </View>
        </>
      ) : null}

      <ListGroup title="עוד פעולות">
        {canTranscribe(song) ? (
          <ListItem
            icon="refresh"
            tint={c.accent}
            title={song.status === 'pending' ? 'מתמללת…' : 'תמלול מחדש'}
            subtitle="שם ומילים חדשים מההקלטה"
            disabled={song.status === 'pending'}
            onPress={transcribeAgain}
            chevron={false}
          />
        ) : null}
        <ListItem icon="trash-outline" title="מחיקת השיר" onPress={remove} danger chevron={false} last />
      </ListGroup>

      <TechDetails song={song} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, marginTop: space.s },
  titleBox: { flexDirection: 'row', alignItems: 'center', gap: space.s, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m },
  titleInput: { flex: 1, fontSize: 21, paddingVertical: space.m },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space.m, borderRadius: 18 },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name={open ? 'chevron-down' : 'chevron-back'} size={18} color={c.inkSoft} />
          <T weight="medium" style={{ color: c.inkSoft }}>פרטים טכניים</T>
        </View>
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
