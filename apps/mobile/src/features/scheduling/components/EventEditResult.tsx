import { Button, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { AiEventMoveOption } from '../api/event-edit.api';
import type { EventEditState } from '../hooks/useEventEdit';
import { formatAllDaySpan, formatSlot } from '../utils/slot-format';

function describeTimes(
  times: { startAt: string; endAt: string },
  allDay: boolean,
  timeZone: string,
) {
  return allDay
    ? formatAllDaySpan(times.startAt, times.endAt, timeZone)
    : formatSlot(times.startAt, times.endAt, timeZone);
}

/**
 * What the AI bar shows for "change an event": the move it worked out, as a
 * before and after the user confirms. Nothing moves until they tap — the
 * proposal is computed, but the decision stays theirs.
 */
export function EventEditResult({ edit, timeZone }: { edit: EventEditState; timeZone: string }) {
  const theme = useTheme();

  if (edit.moved) {
    const { moved } = edit;
    return (
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
          Moved{' '}
          <Text variant="footnote" color="primary" style={{ fontWeight: '600' }}>
            {moved.title}
          </Text>{' '}
          to {describeTimes(moved.after, moved.allDay, timeZone)}.
        </Text>
      </View>
    );
  }

  if (edit.clarificationQuestion) {
    return (
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
          {edit.clarificationQuestion}
        </Text>
      </View>
    );
  }

  if (edit.options.length === 0) return null;
  const several = edit.options.length > 1;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="tertiary" uppercase>
          {several ? 'Which event?' : 'Move event'}
        </Text>
        {several ? (
          <Text variant="footnote" color="tertiary">
            {`${edit.options.length} events match. Pick the one to move.`}
          </Text>
        ) : null}
      </View>
      {edit.options.map((option, index) => (
        <MoveCard
          key={option.eventId}
          option={option}
          timeZone={timeZone}
          emphasised={!several || index === 0}
          isSaving={edit.confirmingEventId === option.eventId}
          disabled={edit.confirmingEventId !== null}
          onConfirm={() => edit.confirm(option)}
        />
      ))}
    </View>
  );
}

interface MoveCardProps {
  option: AiEventMoveOption;
  timeZone: string;
  /** The single or best match gets the accent wash, as Find Time's top pick does. */
  emphasised: boolean;
  isSaving: boolean;
  disabled: boolean;
  onConfirm: () => void;
}

function MoveCard({ option, timeZone, emphasised, isSaving, disabled, onConfirm }: MoveCardProps) {
  const theme = useTheme();
  const before = describeTimes(option.before, option.allDay, timeZone);
  const after = describeTimes(option.after, option.allDay, timeZone);

  return (
    <View
      accessibilityLabel={`${option.title}, ${option.calendarName}. From ${before} to ${after}.`}
      style={{
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: theme.borderWidth.hairline,
        borderColor: emphasised ? theme.colors.accentSubtle : theme.colors.border,
        backgroundColor: theme.colors.surfaceRaised,
        overflow: 'hidden',
        opacity: disabled && !isSaving ? 0.6 : 1,
      }}
    >
      {emphasised ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.accentMuted }]}
        />
      ) : null}

      <View style={{ gap: 1 }}>
        <Text variant="subhead" numberOfLines={1} style={{ fontWeight: '600' }}>
          {option.title}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {option.calendarName}
        </Text>
      </View>

      {/* Before and after stacked, each with its label: the change is the point
          of the card, so the two times are compared line to line. */}
      <View style={{ gap: theme.spacing.xs }}>
        <TimeLine label="From" value={before} tone="old" />
        <TimeLine label="To" value={after} tone="new" />
      </View>

      <Button
        label={isSaving ? 'Moving…' : 'Move'}
        size="sm"
        variant={emphasised ? 'primary' : 'secondary'}
        loading={isSaving}
        disabled={disabled}
        onPress={onConfirm}
        accessibilityLabel={`Move ${option.title} to ${after}`}
        leadingIcon={
          isSaving ? undefined : (
            <Ionicons
              name="arrow-forward"
              size={14}
              color={emphasised ? theme.colors.onAccent : theme.colors.textPrimary}
            />
          )
        }
      />
    </View>
  );
}

function TimeLine({ label, value, tone }: { label: string; value: string; tone: 'old' | 'new' }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
      <Text variant="caption" color="tertiary" uppercase numberOfLines={1} style={{ width: 44 }}>
        {label}
      </Text>
      <Text
        variant="footnote"
        color={tone === 'old' ? 'tertiary' : 'primary'}
        numberOfLines={1}
        style={[
          { flex: 1 },
          tone === 'old' ? { textDecorationLine: 'line-through' } : { fontWeight: '600' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
