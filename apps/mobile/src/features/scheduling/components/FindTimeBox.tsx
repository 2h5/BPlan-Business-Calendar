import { singleLine, useTheme } from '@cal/ui';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EventEditResult } from './EventEditResult';
import { FindTimeLoading } from './FindTimeLoading';
import {
  FindTimeClarification,
  FindTimeErrorNotice,
  FindTimeFollowUpPrompt,
  FindTimeScheduledNotice,
} from './FindTimeNotices';
import { FindTimePill, FindTimeSendButton } from './FindTimePill';
import { FindTimeProposalResults } from './FindTimeProposalResults';
import { FindTimeReadback } from './FindTimeReadback';
import { usePaywallStore } from '../../../store/paywall.store';
import type { FindTimeSuggestion } from '../api/find-time.api';
import { useConfirmSlot } from '../hooks/useConfirmSlot';
import { useEventEdit } from '../hooks/useEventEdit';
import { useFindTime } from '../hooks/useFindTime';
import { useFindTimeAutoClose } from '../hooks/useFindTimeAutoClose';
import { FIND_TIME_EXAMPLES, formatExample } from '../hooks/useRotatingExample';
import {
  deriveFindTimeBoxState,
  staleResultsOnEdit,
  type FindTimeBoxInputs,
} from '../utils/find-time-box-state';
import { isEventEditRequest } from '../utils/is-event-edit-request';

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
  const openPaywall = usePaywallStore((state) => state.open);

  const flows: Omit<FindTimeBoxInputs, 'text'> = {
    findTime: {
      isPending: findTime.isPending,
      hasProposal: findTime.proposal !== null,
      hasClarification: findTime.clarification !== null,
      errorMessage: findTime.errorMessage,
      requiresUpgrade: findTime.requiresUpgrade,
    },
    confirmSlot: {
      hasConfirmation: confirmSlot.confirmation !== null,
      errorMessage: confirmSlot.errorMessage,
    },
    edit: {
      isPending: edit.isPending,
      optionCount: edit.options.length,
      hasClarification: edit.clarificationQuestion !== null,
      hasMoved: edit.moved !== null,
      errorMessage: edit.errorMessage,
      requiresUpgrade: edit.requiresUpgrade,
    },
  };
  const state = deriveFindTimeBoxState({ text, ...flows });
  const { confirmation } = confirmSlot;

  const { reset: resetFindTime } = findTime;
  const { reset: resetSlot } = confirmSlot;
  const { reset: resetEdit } = edit;
  const resetAll = useCallback(() => {
    setText('');
    resetFindTime();
    resetSlot();
    resetEdit();
  }, [resetFindTime, resetSlot, resetEdit]);

  const { isClosing, resultsHeight, closingStyle, fieldStyle } = useFindTimeAutoClose({
    finished: state.finished,
    focused,
    reset: resetAll,
    onFinished,
  });

  const handleSubmit = () => {
    if (!state.canSubmit) return;
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

  const handleChangeText = (next: string) => {
    setText(next);
    const stale = staleResultsOnEdit(flows);
    if (stale.findTime) findTime.reset();
    if (stale.confirmSlot) confirmSlot.reset();
    if (stale.edit) edit.reset();
  };

  return (
    <View accessibilityLabel="Find a time">
      <FindTimePill
        trailing={
          <FindTimeSendButton
            enabled={state.canSubmit && !isClosing}
            pending={state.isPending}
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
              if (state.isIdle) onIdleBlur?.();
            }}
            onChangeText={handleChangeText}
            style={[
              singleLine(theme.typography.callout),
              { height: '100%', color: theme.colors.textPrimary },
            ]}
          />
        </Animated.View>
      </FindTimePill>

      {state.hasResults ? (
        <Animated.View
          onLayout={(event) => {
            if (!isClosing) resultsHeight.value = event.nativeEvent.layout.height;
          }}
          style={[
            { gap: theme.spacing.md, paddingTop: theme.spacing.md },
            isClosing ? [{ overflow: 'hidden' }, closingStyle] : null,
          ]}
        >
          {/* Three placeholders in the shape of the answer, so the wait explains
          itself rather than leaving the box looking inert. */}
          {state.isPending ? <FindTimeLoading /> : null}

          <EventEditResult edit={edit} timeZone={timeZone} />

          {state.finished ? <FindTimeFollowUpPrompt /> : null}

          {/* Readback: the user must be able to see the window we actually searched,
          especially when they said something as broad as "next week". */}
          {findTime.readback && findTime.proposal && !confirmation ? (
            <FindTimeReadback readback={findTime.readback} />
          ) : null}

          {findTime.clarification && !confirmation ? (
            <FindTimeClarification question={findTime.clarification.clarificationQuestion} />
          ) : null}

          {confirmation ? (
            <FindTimeScheduledNotice confirmation={confirmation} timeZone={timeZone} />
          ) : null}

          {findTime.proposal && !confirmation ? (
            <FindTimeProposalResults
              suggestions={findTime.proposal.suggestions}
              timeZone={timeZone}
              bookingSuggestionId={confirmSlot.confirmingSuggestionId}
              onSelect={handleSelect}
            />
          ) : null}

          {state.errorMessage ? (
            <FindTimeErrorNotice
              message={state.errorMessage}
              onUpgrade={state.requiresUpgrade ? openPaywall : undefined}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
