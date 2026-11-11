import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, TextInputInstance, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { allCategories, getCategory, isBuiltinCategory, UNSORTED_ID } from '../../core/categories';
import { textOn } from '../../core/color';
import { lastEmoji } from '../../core/emoji';
import { createCategory, deleteCategory, getSong, setCategories, updateCategory } from '../../db/repo';
import { useLibrary } from '../../db/useLibrary';
import { diag } from '../../diag/log';
import { Button, T } from '../../ui/components';
import { toast } from '../../ui/toast';
import { font, radius, space, useTheme } from '../../ui/theme';

/** Emoji she can pick for a category: kindergarten topics first. */
const ICONS = [
  '🎵', '🎶', '🎤', '🥁', '🎹', '🎸', '☀️', '🌙', '⭐', '🌈', '🌧️', '❄️', '🌸', '🌳', '🍎', '🍯',
  '🎂', '🎈', '🎁', '🎭', '🕯️', '🕎', '🇮🇱', '📖', '✏️', '🔢', '🧸', '🚗', '🚂', '✈️', '🏠', '❤️',
  '👋', '👨‍👩‍👧', '🐘', '🐶', '🐱', '🦋', '🐟', '🐝', '🖐️', '💃', '🧺', '🔔', '🌿', '🎉',
];
const COLORS = ['#E46B5D', '#F2A93B', '#D9A13B', '#7CB342', '#26A69A', '#4FA3C7', '#3F7FBF', '#5C6BC0', '#8E7CC3', '#EC6FA7', '#8D6E63', '#78909C'];

/**
 * A category: new (no `id`), or one to rename, re-colour or remove — built-in ones too. With
 * `song`, a new category is added to that song (made from its details screen).
 */
export default function EditCategory() {
  const { id, song } = useLocalSearchParams<{ id?: string; song?: string }>();
  useLibrary(); // her categories are loaded with the library
  const c = useTheme();
  const existing = id ? getCategory(id) : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0]);
  const [color, setColor] = useState(existing?.color ?? COLORS[allCategories().length % COLORS.length]);
  const [saving, setSaving] = useState(false);
  const emojiField = useRef<TextInputInstance>(null);
  const ink = textOn(color);

  const save = async () => {
    const clean = name.trim();
    if (!clean) return toast('צריך שם לקטגוריה', 'info');
    const clash = allCategories().find((x) => x.id !== id && x.name.trim() === clean);
    if (clash) return toast(`כבר יש קטגוריה בשם "${clean}"`, 'info');
    setSaving(true);
    try {
      if (existing) {
        await updateCategory(existing.id, clean, icon, color);
      } else {
        const newId = await createCategory(clean, icon, color);
        if (song) {
          const s = await getSong(song);
          // Her own choice: confirmed, so the AI never takes it away.
          if (s) await setCategories(s.id, [...s.categories.map((x) => ({ id: x.categoryId, confidence: x.confidence, confirmed: x.confirmed })), { id: newId, confidence: 1, confirmed: true }]);
        }
      }
      toast(existing ? 'הקטגוריה נשמרה' : `הקטגוריה "${clean}" נוספה`, 'success');
      router.back();
    } catch (e) {
      diag('category save failed', e);
      toast('לא הצלחנו לשמור', 'error');
      setSaving(false);
    }
  };

  const remove = () =>
    existing &&
    Alert.alert(`להסיר את "${existing.name}"?`, 'השירים יישארו בספרייה, ושירים בלי קטגוריה אחרת יעברו ל"לא מסווג".', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'הסרה',
        style: 'destructive',
        onPress: async () => {
          await deleteCategory(existing.id);
          toast('הקטגוריה הוסרה', 'success');
          router.dismissAll();
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? 'עריכת קטגוריה' : 'קטגוריה חדשה' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { backgroundColor: color }]}>
          <T weight="bold" size={22} numberOfLines={2} style={{ color: ink }}>{name.trim() || 'שם הקטגוריה'}</T>
          <T size={56} style={styles.art} accessible={false}>{icon}</T>
        </View>

        <T soft size={13}>שם</T>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="למשל: שירי גשם"
          placeholderTextColor={c.inkSoft}
          maxLength={30}
          autoFocus={!existing}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="שם הקטגוריה"
          style={[styles.input, { color: c.ink, borderColor: c.line, backgroundColor: c.surface, fontFamily: font.bold }]}
        />

        <T soft size={13} style={styles.label}>סמל</T>
        <View style={styles.wrap}>
          {/* Any emoji from the phone's keyboard (owner, 0.14.0): the field takes the last one typed. */}
          <TextInput
            ref={emojiField}
            value=""
            onChangeText={(text) => {
              const e = lastEmoji(text);
              if (e) {
                setIcon(e);
                emojiField.current?.blur();
              }
              else if (text.trim()) toast('כאן בוחרים אימוג׳י: במקלדת, הכפתור עם הפרצוף 🙂', 'info');
            }}
            placeholder="+"
            placeholderTextColor={c.primary}
            accessibilityLabel="אימוג׳י אחר מהמקלדת"
            accessibilityHint="פותח את המקלדת. בחרי אימוג׳י, והוא יהיה הסמל של הקטגוריה"
            style={[styles.icon, styles.custom, { borderColor: c.primary, color: c.ink, fontFamily: font.bold }]}
          />
          {(ICONS.includes(icon) ? ICONS : [icon, ...ICONS]).map((e) => (
            <Pressable
              key={e}
              onPress={() => setIcon(e)}
              accessibilityRole="radio"
              accessibilityState={{ selected: e === icon }}
              accessibilityLabel={e}
              style={[styles.icon, { backgroundColor: e === icon ? color + '44' : c.surfaceAlt, borderColor: e === icon ? color : 'transparent' }]}
            >
              <T size={24}>{e}</T>
            </Pressable>
          ))}
        </View>

        <T soft size={12} style={{ marginTop: space.xs }}>
          ב־+ אפשר לבחור כל אימוג׳י מהמקלדת של הטלפון.
        </T>

        <T soft size={13} style={styles.label}>צבע</T>
        <View style={styles.wrap}>
          {COLORS.map((col) => (
            <Pressable
              key={col}
              onPress={() => setColor(col)}
              accessibilityRole="radio"
              accessibilityState={{ selected: col === color }}
              accessibilityLabel={`צבע ${col}`}
              style={[styles.swatch, { backgroundColor: col, borderColor: col === color ? c.ink : 'transparent' }]}
            />
          ))}
        </View>

        <Button label={existing ? 'שמירה' : song ? 'הוספה לשיר' : 'הוספה'} icon="checkmark" onPress={save} disabled={saving} style={{ marginTop: space.xl }} />
        {existing && existing.id !== UNSORTED_ID ? (
          <Button label="הסרת הקטגוריה" icon="trash-outline" kind="quiet" onPress={remove} style={{ marginTop: space.s }} />
        ) : null}
        {existing && isBuiltinCategory(existing.id) && existing.id !== UNSORTED_ID ? (
          <T soft size={13} style={{ marginTop: space.s, textAlign: 'center' }}>
            קטגוריה מובנית: אפשר להחזיר אותה בהגדרות.
          </T>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, paddingBottom: 40 },
  preview: { height: 110, borderRadius: radius.m, padding: space.m, overflow: 'hidden', marginBottom: space.l },
  art: { position: 'absolute', bottom: -8, end: -6, transform: [{ rotate: '-20deg' }] },
  input: { borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: 52, fontSize: 18, textAlign: 'right', marginTop: space.xs },
  label: { marginTop: space.l, marginBottom: space.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  icon: { width: 48, height: 48, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  custom: { borderStyle: 'dashed', textAlign: 'center', fontSize: 24, padding: 0 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
});
