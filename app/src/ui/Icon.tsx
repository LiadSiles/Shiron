import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The app's UI icons (tabs, buttons, banners): one rounded, friendly set (Ionicons) so they
 * look the same on iPhone and Android, unlike emoji. Category tiles keep their emoji — those are
 * content, chosen for children's topics. Media controls are drawn in ui/icons.tsx.
 */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  // An icon is a glyph of the icon font: VoiceOver read it as a stray character (", מחיקת
  // הרשימה"). The words next to it, or the button's own label, say what it means.
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  );
}
