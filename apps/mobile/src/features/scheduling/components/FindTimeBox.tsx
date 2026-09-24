import { Button, Text, singleLine, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FindTimeLoading } from './FindTimeLoading';
import { FindTimePill, FindTimeSendButton } from './FindTimePill';
import { usePaywallStore } from '../../../store/paywall.store';
import type { FindTimeReadback, FindTimeSuggestion } from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import { useFindTime } from '../hooks/useFindTime';

// Short enough to fit the field on a phone; a truncated example reads as a bug.
const PLACEHOLDER = 'Coffee with Pat Friday';

export interface FindTimeBoxProps {
  timeZone: string;
  /** Notified after a slot is booked, e.g. so the screen can navigate to it. */
  onScheduled?: (suggestion: FindTimeSuggestion) => void;
  /** Focuses the field on mount, for a box that was just expanded from a bar. */
  autoFocus?: boolean;
  /** The field lost focus with nothing typed and nothing showing — the box can fold away. */
  onIdleBlur?: () => void;
}

/**
 * The free-text scheduling box on Today. The text goes to the server verbatim,
 * where Luna interprets it and the deterministic engine resolves the window and
 * finds genuinely open slots — so "next week" and "this weekend" mean the same
 * thing here as they do on the web.
 *
 * This is the phone's version of the web `FindTimeBox` and shares its api and
 * hooks verbatim — only the presentation differs, so the two surfaces cannot
 * drift on which errors they surface or how a stale slot is handled.
 */
export function FindTimeBox({ timeZone, onScheduled, autoFocus, onIdleBlur }: FindTimeBoxProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const findTime = useFindTime();
  const confirmSlot = useConfirmSlot();

  const handleSubmit = () => {
    if (!canSubmit) return;
    confirmSlot.reset();
    findTime.submit(text, timeZone);
  };

  const handleSelect = (suggestion: FindTimeSuggestion) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmSlot.confirm(suggestion.id);
    onScheduled?.(suggestion);
  };

  const canSubmit = text.trim().length > 0 && !findTime.isPending;
  const { confirmation } = confirmSlot;
  const errorMessage = findTime.errorMessage ?? confirmSlot.errorMessage;
  const openPaywall = usePaywallStore((state) => state.open);

  return (
    <View accessibilityLabel="Find a time" style={{ gap: theme.spacing.md }}>
      <FindTimePill
        trailing={
          <FindTimeSendButton
            enabled={canSubmit}
            pending={findTime.isPending}
            onPress={handleSubmit}
          />
        }
      >
        <TextInput
          value={text}
          placeholder={PLACEHOLDER}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.accent}
          accessibilityLabel="Describe what you want to schedule"
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
          autoFocus={autoFocus}
          onBlur={() => {
            const idle =
              text.trim().length === 0 &&
              !findTime.isPending &&
              !findTime.proposal &&
              !findTime.clarification &&
              !errorMessage &&
              !confirmation;
            if (idle) onIdleBlur?.();
          }}
          onChangeText={(next) => {
            setText(next);
            if (findTime.proposal || findTime.clarification || findTime.errorMessage)
              findTime.reset();
            if (confirmSlot.confirmation || confirmSlot.errorMessage) confirmSlot.reset();
          }}
          style={[
            singleLine(theme.typography.callout),
            { height: '100%', color: theme.colors.textPrimary },
          ]}
        />
      </FindTimePill>

      {/* Three placeholders in the shape of the answer, so the wait explains
          itself rather than leaving the box looking inert. */}
      {findTime.isPending ? <FindTimeLoading /> : null}

      {/* Readback: the user must be able to see the window we actually searched,
          especially when they said something as broad as "next week". */}
      {findTime.readback && findTime.proposal && !confirmation ? (
        <ReadbackChips readback={findTime.readback} />
      ) : null}

      {/* Luna asks instead of guessing. Answering is just another submit, so the
          question sits inline above the same input rather than in a modal. */}
      {findTime.clarification && !confirmation ? (
        <View
          accessibilityRole="alert"
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.accentSubtle,
            backgroundColor: theme.colors.inputBackground,
          }}
        >
          <Text variant="footnote" color="secondary">
            {findTime.clarification.clarificationQuestion}
          </Text>
        </View>
      ) : null}

      {confirmation ? (
        <View
          accessibilityRole="alert"
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.successSubtle,
            backgroundColor: theme.colors.successSubtle,
          }}
        >
          <Text variant="footnote" color="secondary">
            Scheduled{' '}
            <Text variant="footnote" color="primary" style={{ fontWeight: '600' }}>
              {confirmation.event.title}
            </Text>{' '}
            for {formatSlot(confirmation.event.startAt, confirmation.event.endAt, timeZone)}.
          </Text>
        </View>
      ) : null}

      {findTime.proposal && !confirmation ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ResultsHeading />
          {findTime.proposal.suggestions.map((suggestion) => (
            <SlotRow
              key={suggestion.id}
              suggestion={suggestion}
              timeZone={timeZone}
              isTopPick={suggestion.rank === 1}
              isBooking={confirmSlot.confirmingSuggestionId === suggestion.id}
              disabled={confirmSlot.confirmingSuggestionId !== null}
              onPress={() => handleSelect(suggestion)}
            />
          ))}
        </View>
      ) : null}

      {errorMessage ? (
        <View
          accessibilityRole="alert"
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.sm,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.dangerSubtle,
            backgroundColor: theme.colors.dangerSubtle,
          }}
        >
          <Text variant="footnote" color="danger">
            {errorMessage}
          </Text>
          {findTime.requiresUpgrade ? (
            <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
              <Button label="See Pro plans" size="sm" onPress={openPaywall} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ReadbackChip({ label, emphasis = false }: { label: string; emphasis?: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingVertical: 2,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: theme.colors.borderSubtle,
        backgroundColor: theme.colors.inputBackground,
      }}
    >
      <Text
        variant="footnote"
        color={emphasis ? 'primary' : 'secondary'}
        style={emphasis ? { fontWeight: '600' } : undefined}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Renders the server's readback. Only the fields the server actually resolved
 * are shown: an absent date label means the search was left unconstrained, and
 * inventing a label for it here would misreport the window.
 */
function ReadbackChips({ readback }: { readback: FindTimeReadback }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      <ReadbackChip label={readback.title} emphasis />
      <ReadbackChip label={readback.durationLabel} />
      {readback.dateLabel ? <ReadbackChip label={readback.dateLabel} /> : null}
      {readback.timeLabel ? <ReadbackChip label={readback.timeLabel} /> : null}
      {readback.location ? <ReadbackChip label={readback.location} /> : null}
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

/** e.g. "Thu, Sep 10". */
function formatSlotDay(startAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(new Date(startAt));
}

/**
 * e.g. "3:45 – 4:00 PM", or "11:45 AM – 12:15 PM" when the slot crosses noon or
 * midnight. Repeating a meridiem that has not changed only costs width.
 */
function formatSlotRange(startAt: string, endAt: string, timeZone: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startParts = clockParts(start, timeZone);
  const endParts = clockParts(end, timeZone);

  return startParts.meridiem === endParts.meridiem
    ? `${startParts.time} – ${endParts.time} ${endParts.meridiem}`
    : `${startParts.time} ${startParts.meridiem} – ${endParts.time} ${endParts.meridiem}`;
}

/** e.g. "Thu, Sep 10 · 3:45 PM – 4:00 PM". Used where width is not scarce. */
function formatSlot(startAt: string, endAt: string, timeZone: string): string {
  return `${formatSlotDay(startAt, timeZone)} · ${formatSlotRange(startAt, endAt, timeZone)}`;
}

function clockParts(value: Date, timeZone: string): { time: string; meridiem: string } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(value);

  // "3:45 PM" -> { time: "3:45", meridiem: "PM" }. A 24-hour locale has no
  // meridiem to split off, in which case the whole string is the time.
  const separator = formatted.lastIndexOf(' ');
  if (separator === -1) return { time: formatted, meridiem: '' };

  return {
    time: formatted.slice(0, separator),
    meridiem: formatted.slice(separator + 1),
  };
}
