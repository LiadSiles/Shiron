import { Text, TextProps } from 'react-native';
import { font, useTheme } from './theme';

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
