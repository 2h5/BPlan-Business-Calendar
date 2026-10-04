import { Text, useTheme } from '@cal/ui';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { isPurchasingSupported } from '../api/purchases.api';
import { usePurchaseFlow, type PurchaseFlowState } from '../hooks/usePurchases';

/**
 * "Restore Purchases" for Settings, as Apple requires it to be reachable
 * outside the upgrade page too. Says what happened on the row itself.
 */
export function RestorePurchasesRow() {
  const theme = useTheme();
  const flow = usePurchaseFlow();

  if (!isPurchasingSupported()) return null;

  const working = flow.state.phase === 'working';
  const result = resultText(flow.state);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Restore purchases"
      // Also held while a purchase from the upgrade page is still confirming.
      accessibilityState={{ busy: flow.isBusy, disabled: flow.isBusy }}
      disabled={flow.isBusy}
      onPress={flow.restore}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.hitSlopSize + theme.spacing.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
          borderTopWidth: theme.borderWidth.hairline,
          borderTopColor: theme.colors.borderSubtle,
        },
        pressed && { backgroundColor: theme.colors.hover },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">Restore purchases</Text>
        {result ? (
          <Text variant="footnote" color={result.tone} accessibilityLiveRegion="polite">
            {result.text}
          </Text>
        ) : null}
      </View>
      {working ? <ActivityIndicator color={theme.colors.textTertiary} /> : null}
    </Pressable>
  );
}

function resultText(
  state: PurchaseFlowState,
): { text: string; tone: 'secondary' | 'success' | 'danger' } | null {
  switch (state.phase) {
    case 'done':
      return { text: 'Purchase restored. Pro is on.', tone: 'success' };
    case 'unconfirmed':
      return { text: 'Payment received. Pro will switch on shortly.', tone: 'secondary' };
    case 'nothing-to-restore':
      return { text: 'No previous purchases for this Apple ID.', tone: 'secondary' };
    case 'failed':
      return { text: state.message, tone: 'danger' };
    default:
      return null;
  }
}
