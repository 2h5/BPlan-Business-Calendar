import { Text, useTheme } from '@cal/ui';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

export interface TodayPanelProps {
  title: string;
  count: number;
  /** Trailing text button in the header, e.g. "Full calendar →". */
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

/**
 * The web's `.section` container: a titled panel whose header is divided from
 * its body by a hairline. Today stacks two of these where the web sits them
 * side by side.
 */
export function TodayPanel({ title, count, actionLabel, onAction, children }: TodayPanelProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth.hairline,
        borderColor: theme.colors.borderSubtle,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.borderSubtle,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="headline">{title}</Text>
          <Text variant="footnote" color="tertiary">
            {count}
          </Text>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={8}
          >
            {({ pressed }) => (
              <Text
                variant="footnote"
                style={{
                  color: pressed ? theme.colors.accentPressed : theme.colors.accent,
                  fontWeight: '500',
                }}
              >
                {actionLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

/**
 * An in-panel group label — the web's `.taskSectionHeader`, with the overdue
 * variant carrying the danger tone and its warning glyph.
 */
export function PanelSectionHeader({
  label,
  count,
  tone = 'neutral',
  icon,
}: {
  label: string;
  count: number;
  tone?: 'neutral' | 'danger';
  icon?: ReactNode;
}) {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.colors.danger : theme.colors.textTertiary;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        borderBottomWidth: theme.borderWidth.hairline,
        borderBottomColor: theme.colors.borderSubtle,
        backgroundColor: theme.colors.surfaceRaised,
      }}
    >
      {icon}
      <Text variant="caption" uppercase style={{ color, letterSpacing: 0.9 }}>
        {label}
      </Text>
      <View
        style={{
          minWidth: 17,
          paddingHorizontal: 4,
          paddingVertical: 1,
          borderRadius: 3,
          alignItems: 'center',
          backgroundColor:
            tone === 'danger' ? theme.colors.dangerSubtle : theme.colors.surfaceElevated,
        }}
      >
        <Text variant="footnote" style={{ color, fontSize: 11, lineHeight: 15 }}>
          {count}
        </Text>
      </View>
    </View>
  );
}
