import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { FindTimeSuggestion } from '../api/find-time.api';
import { formatSlot, formatSlotDay, formatSlotRange } from '../utils/slot-format';

export interface FindTimeProposalResultsProps {
  suggestions: readonly FindTimeSuggestion[];
  timeZone: string;
  /** The slot being booked, if any — every other row is disabled meanwhile. */
  bookingSuggestionId: string | null;
  onSelect: (suggestion: FindTimeSuggestion) => void;
}

/** The ranked, verified slots for a request, each one tap from being booked. */
export function FindTimeProposalResults({
  suggestions,
  timeZone,
  bookingSuggestionId,
  onSelect,
}: FindTimeProposalResultsProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <ResultsHeading />
      {suggestions.map((suggestion) => (
        <SlotRow
          key={suggestion.id}
          suggestion={suggestion}
          timeZone={timeZone}
          isTopPick={suggestion.rank === 1}
          isBooking={bookingSuggestionId === suggestion.id}
          disabled={bookingSuggestionId !== null}
          onPress={() => onSelect(suggestion)}
        />
      ))}
    </View>
  );
}

/**
 * What the list is, and what it is ordered by — the same claim the web page
 * makes above its results. The conflict-free badge is not decoration: the slots
 * were verified against real availability, and saying so is the difference
 * between a suggestion and a guess.
 *
 * Stacked rather than the web's single row: the heading and the badge alone
 * already fill the width of a phone.
 */
function ResultsHeading() {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="caption" uppercase>
          Verified open slots
        </Text>

        <View
          style={{
            paddingVertical: 2,
            paddingHorizontal: 7,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.successSubtle,
          }}
        >
          <Text variant="caption" color="success">
            ✦ Guaranteed Conflict-Free
          </Text>
        </View>
      </View>

      <Text variant="footnote" color="tertiary">
        Ranked by optimal availability
      </Text>
    </View>
  );
}

interface SlotRowProps {
  suggestion: FindTimeSuggestion;
  timeZone: string;
  /** Rank 1 — carried as the web's accent-tinted card, badge and tag. */
  isTopPick: boolean;
  isBooking: boolean;
  disabled: boolean;
  onPress: () => void;
}

function SlotRow({ suggestion, timeZone, isTopPick, isBooking, disabled, onPress }: SlotRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Schedule ${formatSlot(suggestion.startAt, suggestion.endAt, timeZone)}.${
        isTopPick ? ' Recommended.' : ''
      } ${suggestion.reason}`}
      accessibilityState={{ disabled, busy: isBooking }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: theme.borderWidth.hairline,
        borderColor: pressed || isTopPick ? theme.colors.accentSubtle : theme.colors.border,
        backgroundColor: theme.colors.surfaceRaised,
        overflow: 'hidden',
        opacity: disabled && !isBooking ? 0.6 : 1,
      })}
    >
      {/* The top pick's wash is translucent, so it is layered over the card's
          own colour rather than replacing it — otherwise the card would lose
          the lift that separates it from the box behind. */}
      {isTopPick ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.accentMuted }]}
        />
      ) : null}

      {/* The web tags the recommendation beside the time; at this width that
          line is already spoken for, so it sits above the row instead. */}
      {isTopPick ? (
        <View
          style={{
            alignSelf: 'flex-start',
            paddingVertical: 1,
            paddingHorizontal: 7,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.accentSubtle,
          }}
        >
          <Text variant="caption" color="accent">
            ✦ Recommended
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 26,
            height: 26,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            borderWidth: theme.borderWidth.hairline,
            borderColor: isTopPick ? theme.colors.accentSubtle : theme.colors.border,
            backgroundColor: isTopPick ? theme.colors.accent : theme.colors.surface,
          }}
        >
          <Text
            variant="caption"
            color={isTopPick ? 'onAccent' : 'secondary'}
            style={{ letterSpacing: 0 }}
          >
            {suggestion.rank}
          </Text>
        </View>

        {/* Day above time: one long "Thu, Sep 10 · 3:45 PM – 4:00 PM" cannot
            share a 306pt line with the rank and the action without wrapping
            mid-phrase. */}
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="caption" color="tertiary" uppercase numberOfLines={1}>
            {formatSlotDay(suggestion.startAt, timeZone)}
          </Text>
          <Text variant="subhead" numberOfLines={1} style={{ fontWeight: '600' }}>
            {formatSlotRange(suggestion.startAt, suggestion.endAt, timeZone)}
          </Text>
        </View>

        {/* Drawn as a button but not one: the whole row is the tap target, and
            two nested targets would only make the smaller one harder to hit. */}
        <View
          pointerEvents="none"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 32,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth.hairline,
            borderColor: isTopPick ? theme.colors.accentSubtle : theme.colors.border,
            backgroundColor: isTopPick ? theme.colors.accentSubtle : theme.colors.surface,
          }}
        >
          <Text
            variant="caption"
            color={isTopPick ? 'accent' : 'primary'}
            style={{ letterSpacing: 0 }}
          >
            {isBooking ? 'Booking…' : 'Schedule'}
          </Text>
          {isBooking ? null : (
            <Ionicons
              name="arrow-forward"
              size={12}
              color={isTopPick ? theme.colors.accent : theme.colors.textPrimary}
            />
          )}
        </View>
      </View>

      {/* The reason spans the full row so it never has to be truncated. */}
      <Text variant="footnote" color="tertiary">
        {suggestion.reason}
      </Text>
    </Pressable>
  );
}
