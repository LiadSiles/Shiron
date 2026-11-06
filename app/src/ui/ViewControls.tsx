import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Layout } from '../core/sorting';
import { T } from './components';
import { Icon } from './Icon';
import { radius, space, useTheme } from './theme';

/**
 * Sort chips (scroll sideways) and a rows/tiles switch, above a list of songs or categories.
 */
export function ViewControls<S extends string>({ sorts, sort, onSort, layout, onLayout }: {
  sorts: { id: S; label: string }[];
  sort: S;
  onSort: (s: S) => void;
  layout: Layout;
  onLayout: (l: Layout) => void;
}) {
  const c = useTheme();
  const tiles = layout === 'tiles';
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flex: 1 }}>
        {sorts.map((s) => {
          const on = s.id === sort;
          return (
            <Pressable
              key={s.id}
              onPress={() => onSort(s.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`מיון: ${s.label}`}
              style={[styles.chip, { backgroundColor: on ? c.primary : c.surfaceAlt }]}
            >
              <T size={14} weight={on ? 'bold' : 'regular'} style={{ color: on ? c.primaryInk : c.ink }}>{s.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={() => onLayout(tiles ? 'rows' : 'tiles')}
        accessibilityRole="button"
        accessibilityLabel={tiles ? 'תצוגת שורות' : 'תצוגת קוביות'}
        style={({ pressed }) => [styles.toggle, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.line }]}
      >
        <Icon name={tiles ? 'list' : 'grid'} size={22} color={c.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.m },
  chips: { gap: space.xs, paddingEnd: space.xs },
  chip: { paddingHorizontal: space.m, minHeight: 40, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
