import { Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

import type { FindTimeReadback as Readback } from '../api/find-time.api';

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
export function FindTimeReadback({ readback }: { readback: Readback }) {
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
