import { rowLabel } from '../core/a11y';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './components';
import { Icon, IconName } from './Icon';
import { radius, space, TOUCH, useTheme } from './theme';

/**
 * Grouped list, the settings pattern everyone knows from their phone: a small heading, then
 * rows in one rounded card. Each row has a coloured icon tile, a title, an optional line under
 * it, and a chevron when it opens something. Used for settings and the song screen's actions,
 * so options are always found in the same shape.
 */
export function ListGroup({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.group}>
      {title ? <T weight="bold" size={14} style={[styles.groupTitle, { color: c.inkSoft }]}>{title}</T> : null}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>
      {footer ? <T soft size={13} style={styles.footer}>{footer}</T> : null}
    </View>
  );
}

export function ListItem({ icon, tint, title, subtitle, value, onPress, danger, chevron = !!onPress, last, disabled }: {
  icon: IconName;
  /** Icon tile colour; defaults to the primary colour. */
  tint?: string;
  title: string;
  subtitle?: string;
  /** Short text at the end of the row ("מחובר"). */
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  /** No divider under the last row of a group. */
  last?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  const colour = danger ? c.bad : tint ?? c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={rowLabel(title, value, subtitle)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : 'transparent', opacity: disabled ? 0.45 : 1 }]}
    >
      <View style={[styles.tile, { backgroundColor: colour + '22' }]}>
        <Icon name={icon} size={20} color={colour} />
      </View>
      <View style={[styles.text, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="medium" size={16} style={danger ? { color: c.bad } : undefined}>{title}</T>
          {subtitle ? <T soft size={13} style={{ lineHeight: 18 }}>{subtitle}</T> : null}
        </View>
        {value ? <T soft size={14}>{value}</T> : null}
        {chevron ? <Icon name="chevron-back" size={18} color={c.inkSoft} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * A row of big square actions (icon over a word) — the main things to do on a screen, side by
 * side, all the same size, so the important choices are obvious and equal.
 */
export function ActionBar({ actions }: {
  actions: { icon: IconName; label: string; onPress: () => void; active?: boolean; primary?: boolean; disabled?: boolean }[];
}) {
  const c = useTheme();
  return (
    <View style={styles.bar}>
      {actions.map((a) => {
        const strong = a.primary || a.active;
        return (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            disabled={a.disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: !!a.active, disabled: !!a.disabled }}
            accessibilityLabel={a.label}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: a.primary ? c.primary : a.active ? c.primarySoft : c.surface,
                borderColor: a.primary ? c.primary : a.active ? c.primary : c.line,
                opacity: a.disabled ? 0.45 : pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Icon name={a.icon} size={26} color={a.primary ? c.primaryInk : strong ? c.primary : c.ink} />
            <T weight="medium" size={14} numberOfLines={1} style={{ color: a.primary ? c.primaryInk : c.ink }}>{a.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xl },
  groupTitle: { marginBottom: space.s, marginStart: space.xs },
  footer: { marginTop: space.s, marginHorizontal: space.xs, lineHeight: 18 },
  card: { borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingStart: space.m, minHeight: 60 },
  tile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    alignSelf: 'stretch',
    paddingVertical: space.m,
    paddingEnd: space.m,
    marginStart: space.m,
    minHeight: TOUCH,
  },
  bar: { flexDirection: 'row', gap: space.s },
  action: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
});
