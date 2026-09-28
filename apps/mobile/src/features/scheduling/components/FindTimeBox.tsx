import { Button, Text, singleLine, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EventEditResult } from './EventEditResult';
import { FindTimeLoading } from './FindTimeLoading';
import { FindTimePill, FindTimeSendButton } from './FindTimePill';
import { usePaywallStore } from '../../../store/paywall.store';
import type { FindTimeReadback, FindTimeSuggestion } from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import { useEventEdit } from '../hooks/useEventEdit';
import { useFindTime } from '../hooks/useFindTime';
import { FIND_TIME_EXAMPLES, formatExample } from '../hooks/useRotatingExample';
import { isEventEditRequest } from '../utils/is-event-edit-request';
import { formatSlot, formatSlotDay, formatSlotRange } from '../utils/slot-format';

export interface FindTimeBoxProps {
  timeZone: string;
  /** An example request shown in the empty field. */
  placeholder?: string;
  /** Notified after a slot is booked, e.g. so the screen can navigate to it. */
  onScheduled?: (suggestion: FindTimeSuggestion) => void;
  /** Focuses the field on mount, for a box that was just expanded from a bar. */
  autoFocus?: boolean;
  /** The field lost focus with nothing typed and nothing showing — the box can fold away. */
  onIdleBlur?: () => void;
  /**
   * A booking or move finished and the user asked for nothing else in time —
   * the box can fold back to its resting state. Without it the box clears
   * itself in place.
   */
  onFinished?: () => void;
}

/** How long a finished request waits for a follow-up before the box resets. */
const FOLLOW_UP_MS = 12_000;
/** The close-up: results fold into the bar before it resets. */
const CLOSE_MS = 320;

/**
 * The free-text scheduling box on Today. The text goes to the server verbatim,
 * where Luna interprets it and the deterministic engine resolves the window and
 * finds genuinely open slots — so "next week" and "this weekend" mean the same
 * thing here as they do on the web.
 *
 * This is the phone's version of the web `FindTimeBox` and shares its api and
 * hooks verbatim — only the presentation differs, so the two surfaces cannot
 * drift on which errors they surface or how a stale slot is handled.
 *
 * The same field also changes existing events: a sentence that opens with
 * "move", "change", "reschedule" and the like goes to the edit flow instead,
 * which proposes a move for the user to confirm.
 */
export function FindTimeBox({
  timeZone,
  placeholder = formatExample(FIND_TIME_EXAMPLES[0]),
  onScheduled,
  autoFocus,
  onIdleBlur,
  onFinished,
}: FindTimeBoxProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const findTime = useFindTime();
  const confirmSlot = useConfirmSlot();
  const edit = useEventEdit();

  const handleSubmit = () => {
    if (!canSubmit) return;
    // The answer renders below the field, where the keyboard would cover it.
    Keyboard.dismiss();
    confirmSlot.reset();
    if (isEventEditRequest(text)) {
      findTime.reset();
      edit.submit(text);
      return;
    }
    edit.reset();
    findTime.submit(text, timeZone);
  };

  const handleSelect = (suggestion: FindTimeSuggestion) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    confirmSlot.confirm(suggestion.id);
    onScheduled?.(suggestion);
  };

  const isPending = findTime.isPending || edit.isPending;
  const canSubmit = text.trim().length > 0 && !isPending;
  const { confirmation } = confirmSlot;
  const errorMessage = findTime.errorMessage ?? confirmSlot.errorMessage ?? edit.errorMessage;
  const requiresUpgrade = findTime.requiresUpgrade || edit.requiresUpgrade;
  const editShowing =
    edit.options.length > 0 || edit.clarificationQuestion !== null || edit.moved !== null;
  const openPaywall = usePaywallStore((state) => state.open);
  const finished = edit.moved !== null || confirmation !== null;

  // After a booking or a move, offer to help again; if the user neither types
  // nor taps into the field in time, close the results up into the bar, then
  // clear everything and fold away. Typing resets the finished state, and
  // focusing pauses the wait.
  const closing = useSharedValue(0);
  const resultsHeight = useSharedValue(0);
  const [isClosing, setIsClosing] = useState(false);
  const { reset: resetFindTime } = findTime;
  const { reset: resetSlot } = confirmSlot;
  const { reset: resetEdit } = edit;
  useEffect(() => {
    if (!finished || focused) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setIsClosing(true);
      closing.value = withTiming(1, {
        duration: CLOSE_MS,
        easing: Easing.bezier(...theme.motion.easing.standard),
      });
      settle = setTimeout(() => {
        setText('');
        resetFindTime();
        resetSlot();
        resetEdit();
        // Folding away unmounts the box; leave it closed so no frame can show
        // the results again before React removes them.
        if (onFinished) onFinished();
        else setIsClosing(false);
      }, CLOSE_MS);
    }, FOLLOW_UP_MS);
    return () => {
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
    };
  }, [
    finished,
    focused,
    onFinished,
    resetFindTime,
    resetSlot,
    resetEdit,
    closing,
    theme.motion.easing.standard,
  ]);

  // Reopen only after React has committed the cleared state, for the same reason.
  useEffect(() => {
    if (!isClosing) closing.value = 0;
  }, [isClosing, closing]);

  // Height is animated only while closing; otherwise the results size to their
  // content. The typed text fades with them so the bar empties as it closes.
  // Padding shrinks with the height: layout never lets a box be shorter than
  // its padding, so a fixed gap would jump the page when the box unmounts.
  const resultsGap = theme.spacing.md;
  const closingStyle = useAnimatedStyle(() => ({
    height: resultsHeight.value * (1 - closing.value),
    paddingTop: resultsGap * (1 - closing.value),
    opacity: 1 - closing.value,
  }));
  const fieldStyle = useAnimatedStyle(() => ({ opacity: 1 - closing.value }));
  const hasResults =
    isPending ||
    editShowing ||
    findTime.proposal !== null ||
    findTime.clarification !== null ||
    confirmation !== null ||
    errorMessage !== null;

  return (
    <View accessibilityLabel="Find a time">
      <FindTimePill
        trailing={
          <FindTimeSendButton
            enabled={canSubmit && !isClosing}
            pending={isPending}
            onPress={handleSubmit}
          />
        }
      >
        <Animated.View style={[{ height: '100%' }, fieldStyle]}>
          <TextInput
            value={text}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.accent}
            accessibilityLabel="Describe what to schedule, or which event to move"
            returnKeyType="search"
            onSubmitEditing={handleSubmit}
            autoFocus={autoFocus}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const idle =
                text.trim().length === 0 &&
                !isPending &&
                !editShowing &&
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
              if (editShowing || edit.errorMessage) edit.reset();
            }}
            style={[
              singleLine(theme.typography.callout),
              { height: '100%', color: theme.colors.textPrimary },
            ]}
          />
        </Animated.View>
      </FindTimePill>

      {hasResults ? (
        <Animated.View
          onLayout={(event) => {
            if (!isClosing) resultsHeight.value = event.nativeEvent.layout.height;
          }}
          style={[
            { gap: theme.spacing.md, paddingTop: resultsGap },
            isClosing ? [{ overflow: 'hidden' }, closingStyle] : null,
          ]}
        >
          {/* Three placeholders in the shape of the answer, so the wait explains
          itself rather than leaving the box looking inert. */}
          {isPending ? <FindTimeLoading /> : null}

          <EventEditResult edit={edit} timeZone={timeZone} />

          {finished ? <FollowUpPrompt /> : null}

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
              {requiresUpgrade ? (
                <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
                  <Button label="See Pro plans" size="sm" onPress={openPaywall} />
                </View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The offer to help again once a request is done, set like the field's own text. */
function FollowUpPrompt() {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Ionicons name="sparkles" size={14} color={theme.colors.focusAccent} />
      <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
        Is there anything else I can assist you with?
      </Text>
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
