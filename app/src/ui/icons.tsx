import { View } from 'react-native';

/**
 * Media icons drawn with Views, so they look the same on iOS and Android (the Unicode media
 * symbols render as emoji on some phones and differ between platforms). Always laid out LTR:
 * media controls are not mirrored in right-to-left interfaces.
 */

function Triangle({ size, color, pointing }: { size: number; color: string; pointing: 'right' | 'left' }) {
  const h = size;
  const w = size * 0.86;
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: h / 2,
        borderBottomWidth: h / 2,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        ...(pointing === 'right'
          ? { borderLeftWidth: w, borderLeftColor: color }
          : { borderRightWidth: w, borderRightColor: color }),
      }}
    />
  );
}

function Bar({ size, color, width }: { size: number; color: string; width: number }) {
  return <View style={{ width, height: size, backgroundColor: color, borderRadius: width / 3 }} />;
}

export function PlayIcon({ size = 18, color }: { size?: number; color: string }) {
  // Nudged right: a triangle looks off-centre when its box is centred.
  return (
    <View style={{ direction: 'ltr', marginLeft: size * 0.15 }}>
      <Triangle size={size} color={color} pointing="right" />
    </View>
  );
}

export function PauseIcon({ size = 18, color }: { size?: number; color: string }) {
  const bar = Math.max(3, size * 0.3);
  return (
    <View style={{ direction: 'ltr', flexDirection: 'row', gap: size * 0.22 }}>
      <Bar size={size} color={color} width={bar} />
      <Bar size={size} color={color} width={bar} />
    </View>
  );
}

export function NextIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <View style={{ direction: 'ltr', flexDirection: 'row', alignItems: 'center' }}>
      <Triangle size={size} color={color} pointing="right" />
      <Bar size={size} color={color} width={Math.max(2, size * 0.16)} />
    </View>
  );
}

export function PreviousIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <View style={{ direction: 'ltr', flexDirection: 'row', alignItems: 'center' }}>
      <Bar size={size} color={color} width={Math.max(2, size * 0.16)} />
      <Triangle size={size} color={color} pointing="left" />
    </View>
  );
}
