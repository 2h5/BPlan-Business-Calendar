import { Button, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { FindTimeConfirmation } from '../api/find-time.api';
import { formatSlot } from '../utils/slot-format';

type NoticeTone = 'question' | 'success' | 'danger';

/** An inline, announced notice under the field. */
function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  const theme = useTheme();
  const colors = {
    question: { border: theme.colors.accentSubtle, background: theme.colors.inputBackground },
    success: { border: theme.colors.successSubtle, background: theme.colors.successSubtle },
    danger: { border: theme.colors.dangerSubtle, background: theme.colors.dangerSubtle },
  }[tone];

  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: theme.spacing.md,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      {children}
    </View>
  );
}

/** The offer to help again once a request is done, set like the field's own text. */
export function FindTimeFollowUpPrompt() {
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

/**
 * Luna asks instead of guessing. Answering is just another submit, so the
 * question sits inline above the same input rather than in a modal.
 */
export function FindTimeClarification({ question }: { question: string }) {
  return (
    <Notice tone="question">
      <Text variant="footnote" color="secondary">
        {question}
      </Text>
    </Notice>
  );
}

export function FindTimeScheduledNotice({
  confirmation,
  timeZone,
}: {
  confirmation: FindTimeConfirmation;
  timeZone: string;
}) {
  return (
    <Notice tone="success">
      <Text variant="footnote" color="secondary">
        Scheduled{' '}
        <Text variant="footnote" color="primary" style={{ fontWeight: '600' }}>
          {confirmation.event.title}
        </Text>{' '}
        for {formatSlot(confirmation.event.startAt, confirmation.event.endAt, timeZone)}.
      </Text>
    </Notice>
  );
}

export function FindTimeErrorNotice({
  message,
  onUpgrade,
}: {
  message: string;
  /** Present when the request failed only because it needs Pro. */
  onUpgrade?: () => void;
}) {
  const theme = useTheme();

  return (
    <Notice tone="danger">
      <Text variant="footnote" color="danger">
        {message}
      </Text>
      {onUpgrade ? (
        <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
          <Button label="See Pro plans" size="sm" onPress={onUpgrade} />
        </View>
      ) : null}
    </Notice>
  );
}
