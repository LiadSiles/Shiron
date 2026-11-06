import { RefObject, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputInstance, View } from 'react-native';
import { Icon } from './Icon';
import { font, radius, space, TOUCH, useTheme } from './theme';

/**
 * The app's one search field: magnifier, text, a clear button once there is text, and a coloured
 * border while typing. Used by the main search bar and the song picker.
 */
export function SearchField({ value, onChangeText, placeholder, label = placeholder, inputRef, onFocus, onBlur, onSubmitEditing }: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Read by screen readers; defaults to the placeholder. */
  label?: string;
  inputRef?: RefObject<TextInputInstance | null>;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
}) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { backgroundColor: c.surface, borderColor: focused ? c.primary : c.line }]}>
      <Icon name="search" size={20} color={focused ? c.primary : c.inkSoft} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={c.inkSoft}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={label}
        style={[styles.input, { color: c.ink, fontFamily: font.regular }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="ניקוי החיפוש">
          <Icon name="close-circle" size={22} color={c.inkSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    minHeight: TOUCH,
    borderRadius: radius.m,
    borderWidth: 1,
    paddingHorizontal: space.m,
  },
  input: { flex: 1, fontSize: 17, paddingVertical: space.s },
});
