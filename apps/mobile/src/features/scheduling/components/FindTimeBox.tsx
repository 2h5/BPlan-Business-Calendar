import { formatDuration } from '@cal/domain';
import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { DEFAULT_MEETING_MINUTES, type FindTimeSuggestion } from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import { useFindTime } from '../hooks/useFindTime';

const PLACEHOLDER = 'Try "15-minute meeting with Andrew"';

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export interface FindTimeBoxProps {
  timeZone: string;
  /** Notified after a slot is booked, e.g. so the screen can navigate to it. */
  onScheduled?: (suggestion: FindTimeSuggestion) => void;
}

/**
 * The free-text scheduling box on Today. The text is parsed deterministically
 * in `@cal/domain`; the server finds genuinely open slots and ranks them.
 *
 * This is the phone's version of the web `FindTimeBox` and shares its api and
 * hooks verbatim — only the presentation differs, so the two surfaces cannot
 * drift on which errors they surface or how a stale slot is handled.
 */
export function FindTimeBox({ timeZone, onScheduled }: FindTimeBoxProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
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

  return (
    <View
      accessibilityLabel="Find a time"
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth.hairline,
        borderColor: focused ? theme.colors.accent : theme.colors.borderSubtle,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Ionicons
            name="sparkles"
            size={16}
            color={focused ? theme.colors.accent : theme.colors.textTertiary}
            style={{ position: 'absolute', left: theme.spacing.md, zIndex: 1 }}
          />
          <TextInput
            value={text}
            placeholder={PLACEHOLDER}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.accent}
            accessibilityLabel="Describe what you want to schedule"
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChangeText={(next) => {
              setText(next);
              if (findTime.proposal || findTime.errorMessage) findTime.reset();
              if (confirmSlot.confirmation || confirmSlot.errorMessage) confirmSlot.reset();
            }}
            style={[
              theme.typography.callout,
              {
                height: theme.hitSlopSize,
                paddingLeft: theme.spacing.md * 2 + 16,
                paddingRight: theme.spacing.md,
                borderRadius: theme.radius.sm,
                borderWidth: theme.borderWidth.hairline,
                borderColor: focused ? theme.colors.accent : theme.colors.borderSubtle,
                backgroundColor: theme.colors.inputBackground,
                color: theme.colors.textPrimary,
              },
            ]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: findTime.isPending }}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={({ pressed }) => ({
            height: theme.hitSlopSize,
            paddingHorizontal: theme.spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.sm,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.accentSubtle,
            backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
            opacity: canSubmit ? 1 : 0.55,
          })}
        >
          {findTime.isPending ? (
            <ActivityIndicator size="small" color={theme.colors.onAccent} />
          ) : (
            <Text variant="subhead" color="onAccent" style={{ fontWeight: '600' }}>
              Find time
            </Text>
          )}
        </Pressable>
      </View>

      {!findTime.proposal && !findTime.errorMessage && !confirmation ? (
        <Text variant="footnote" color="tertiary">
          Describe a meeting and BCal will suggest the three best open slots in your schedule.
        </Text>
      ) : null}

      {/* Parsed-intent readback: the user must be able to see what we understood. */}
      {findTime.intent && findTime.proposal && !confirmation ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <ReadbackChip label={findTime.intent.title} emphasis />
          <ReadbackChip
            label={`${formatDuration(findTime.intent.durationMinutes ?? DEFAULT_MEETING_MINUTES)}${
              findTime.intent.durationMinutes === null ? ' (default)' : ''
            }`}
          />
          {findTime.intent.dayHint ? (
            <ReadbackChip label={findTime.intent.dayHint === 'today' ? 'Today' : 'Tomorrow'} />
          ) : null}
          {findTime.intent.preferredTimeOfDay !== 'any' ? (
            <ReadbackChip label={TIME_OF_DAY_LABELS[findTime.intent.preferredTimeOfDay] ?? ''} />
          ) : null}
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
          <Text variant="caption" color="tertiary" uppercase>
            Best times
          </Text>
          {findTime.proposal.suggestions.map((suggestion) => (
            <SlotRow
              key={suggestion.id}
              suggestion={suggestion}
              timeZone={timeZone}
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

interface SlotRowProps {
  suggestion: FindTimeSuggestion;
  timeZone: string;
  isBooking: boolean;
  disabled: boolean;
  onPress: () => void;
}

function SlotRow({ suggestion, timeZone, isBooking, disabled, onPress }: SlotRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Schedule ${formatSlot(suggestion.startAt, suggestion.endAt, timeZone)}. ${suggestion.reason}`}
      accessibilityState={{ disabled, busy: isBooking }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: pressed ? theme.colors.accent : theme.colors.borderSubtle,
        backgroundColor: theme.colors.inputBackground,
        opacity: disabled && !isBooking ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <Text variant="footnote" color="tertiary" style={{ fontWeight: '600' }}>
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

        <Text variant="footnote" color="accent" style={{ flexShrink: 0, fontWeight: '600' }}>
          {isBooking ? 'Booking…' : 'Schedule'}
        </Text>
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
