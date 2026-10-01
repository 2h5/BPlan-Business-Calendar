import { Badge, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface PlanTierCardProps {
  name: string;
  summary: string;
  /** The price figure itself, so the caller can roll it between intervals. */
  price: ReactNode;
  period: string;
  features: readonly string[];
  /** Pro: accent edge and tint, ticks, and the badge. */
  highlighted?: boolean;
  badge?: string;
}

/**
 * One plan in the upgrade page's side-by-side pair: name, a one-line summary,
 * the price, and a short ticked list. The highlighted plan is told apart by
 * its accent edge and faint tint, not by size, so the pair still reads as a
 * comparison.
 */
export function PlanTierCard({
  name,
  summary,
  price,
  period,
  features,
  highlighted = false,
  badge,
}: PlanTierCardProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: highlighted ? 1.5 : theme.borderWidth.hairline,
        borderColor: highlighted ? theme.colors.accent : theme.colors.borderSubtle,
        backgroundColor: highlighted ? theme.colors.accentMuted : theme.colors.surface,
        ...(highlighted ? null : theme.elevation.card),
      }}
    >
      <View style={{ gap: 2 }}>
        {/* Holds the badge's height on both cards so names and prices line up. */}
        <View style={{ minHeight: 26, justifyContent: 'center' }}>
          {badge ? <Badge label={badge} tone="accent" style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
        <Text variant="title3" color={highlighted ? 'accent' : 'primary'}>
          {name}
        </Text>
        <Text variant="footnote" color="secondary">
          {summary}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
        {price}
        <Text variant="footnote" color="secondary">
          {period}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {features.map((feature) => (
          <View key={feature} style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <Ionicons
              name="checkmark"
              size={15}
              color={highlighted ? theme.colors.accent : theme.colors.textTertiary}
              style={{ marginTop: 1 }}
            />
            <Text
              variant="footnote"
              color={highlighted ? 'primary' : 'secondary'}
              style={{ flex: 1 }}
            >
              {feature}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
