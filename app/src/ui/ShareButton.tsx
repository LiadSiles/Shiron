import { Platform, Pressable } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from './theme';

/** The header's share button (a list, a category): the platform's own share icon, 48 pt to tap. */
export function ShareButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={24} color={c.primary} />
    </Pressable>
  );
}
