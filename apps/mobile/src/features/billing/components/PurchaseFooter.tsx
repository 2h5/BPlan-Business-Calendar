import { Button, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, View } from 'react-native';

import { env } from '../../../lib/env';
import type { PurchaseFlowState } from '../hooks/usePurchases';

export interface PurchaseFooterProps {
  isPro: boolean;
  /** The line under the button saying what it will charge. */
  priceNote: string;
  /** Why buying can't happen right now, or null when it can. */
  unavailableReason: string | null;
  flow: PurchaseFlowState;
  onPurchase: () => void;
  onRestore: () => void;
  onManage: (() => void) | null;
  isManaging: boolean;
  /** Set when "Manage subscription" found nowhere to send the person. */
  manageNote: string | null;
  onDone: () => void;
}

/**
 * The bottom of the upgrade page: the one action, what it costs, what
 * happened, and the links Apple requires next to a subscription (restore,
 * terms, privacy).
 */
export function PurchaseFooter({
  isPro,
  priceNote,
  unavailableReason,
  flow,
  onPurchase,
  onRestore,
  onManage,
  isManaging,
  manageNote,
  onDone,
}: PurchaseFooterProps) {
  const theme = useTheme();
  const working = flow.phase === 'working';
  const paid = flow.phase === 'unconfirmed' || flow.phase === 'done';
  const status = statusLine(flow, isPro);

  return (
    <View
      style={{
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.md,
        borderTopWidth: theme.borderWidth.hairline,
        borderTopColor: theme.colors.borderSubtle,
      }}
    >
      {isPro ? (
        <View
          accessibilityRole="text"
          style={{
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          <Text variant="bodyStrong" color="success">
            Current plan
          </Text>
        </View>
      ) : (
        <Button
          label={working && flow.action === 'purchase' ? 'Confirming…' : 'Continue with Pro'}
          size="lg"
          fullWidth
          loading={working && flow.action === 'purchase'}
          // Once the store has taken payment, a second tap would buy again.
          disabled={working || paid || unavailableReason !== null}
          trailingIcon={<Ionicons name="arrow-forward" size={18} color={theme.colors.onAccent} />}
          onPress={onPurchase}
        />
      )}

      {isPro ? null : (
        <Text variant="footnote" color="tertiary" align="center">
          {priceNote}
        </Text>
      )}

      {status ? (
        <Text
          variant="footnote"
          color={status.tone}
          align="center"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {status.text}
        </Text>
      ) : !isPro && unavailableReason ? (
        <Text variant="footnote" color="tertiary" align="center">
          {unavailableReason}
        </Text>
      ) : null}

      {isPro ? (
        <>
          {onManage ? (
            <Button
              label="Manage subscription"
              variant="secondary"
              fullWidth
              loading={isManaging}
              onPress={onManage}
            />
          ) : null}
          {manageNote ? (
            <Text variant="footnote" color="secondary" align="center">
              {manageNote}
            </Text>
          ) : null}
          <Button label="Done" variant="ghost" fullWidth onPress={onDone} />
        </>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.xs,
        }}
      >
        {isPro ? null : (
          <FooterLink
            label={working && flow.action === 'restore' ? 'Restoring…' : 'Restore Purchases'}
            disabled={working || unavailableReason !== null}
            onPress={onRestore}
          />
        )}
        {env.billingTermsUrl ? (
          <FooterLink label="Terms of Use" onPress={() => openPage(env.billingTermsUrl)} />
        ) : null}
        {env.billingPrivacyUrl ? (
          <FooterLink label="Privacy Policy" onPress={() => openPage(env.billingPrivacyUrl)} />
        ) : null}
      </View>
    </View>
  );
}

function FooterLink({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={theme.spacing.sm}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Text
          variant="footnote"
          color={disabled ? 'tertiary' : 'accent'}
          style={{ opacity: pressed ? 0.6 : 1 }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function openPage(url: string | undefined): void {
  if (url) void WebBrowser.openBrowserAsync(url);
}

type Tone = 'secondary' | 'success' | 'danger';

function statusLine(flow: PurchaseFlowState, isPro: boolean): { text: string; tone: Tone } | null {
  switch (flow.phase) {
    case 'working':
      return flow.action === 'restore'
        ? { text: 'Checking the App Store for your purchases…', tone: 'secondary' }
        : null;
    case 'done':
      return flow.action === 'restore'
        ? { text: 'Purchase restored. Pro is on.', tone: 'success' }
        : { text: 'You’re on Pro. Thanks for subscribing!', tone: 'success' };
    case 'unconfirmed':
      return isPro
        ? { text: 'You’re on Pro.', tone: 'success' }
        : {
            text: 'Payment received. Pro will switch on in a moment — you can close this page.',
            tone: 'secondary',
          };
    case 'nothing-to-restore':
      return { text: 'No previous purchases were found for this Apple ID.', tone: 'secondary' };
    case 'failed':
      return { text: flow.message, tone: 'danger' };
    default:
      return null;
  }
}
