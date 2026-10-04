import { Text, useTheme } from '@cal/ui';
import { useState } from 'react';
import { Modal, ScrollView, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BillingIntervalToggle, type BillingInterval } from './BillingIntervalToggle';
import { LiquidGlassCloseButton } from './LiquidGlassCloseButton';
import { PlanTierCard } from './PlanTierCard';
import { PurchaseFooter } from './PurchaseFooter';
import { RollingPrice } from './RollingPrice';
import { UpgradeIllustration } from './UpgradeIllustration';
import { PRO_PLAN_NAME } from '../../../lib/brand';
import { usePaywallStore } from '../../../store/paywall.store';
import { isPurchasingSupported } from '../api/purchases.api';
import { useManageSubscription, usePurchaseFlow, useStorePlans } from '../hooks/usePurchases';
import { usePlanState } from '../hooks/useSubscription';
import { buildPaywallPrices } from '../utils/paywall-prices';

/**
 * Short, side-by-side lists — the long-form descriptions live on the web
 * pricing page. Every line is something the plan does today.
 */
const FREE_FEATURES = [
  'All calendar views',
  'Tasks & lists',
  'Conflict detection',
  'Google & Apple sync',
];
const PRO_FEATURES = [
  'Everything in Free',
  'Find Time with AI',
  'Smart slot ranking',
  '1-tap booking',
];

/** The page's one big line: heavier and larger than `display`, as a hero headline. */
const HEADLINE: TextStyle = {
  fontSize: 38,
  lineHeight: 42,
  fontWeight: '800',
  letterSpacing: -1,
};
const ART_WIDTH = 190;
/** How far the copy keeps in from the right, clear of the artwork. */
const COPY_INSET = 112;
const ART_LIFT = 64;

/** Apple requires the renewal terms next to the price of a subscription. */
const RENEWAL_TERMS = 'Renews automatically until cancelled in your App Store settings.';

/**
 * The upgrade prompt, mounted at the root so Settings can open it over
 * whichever tab the user is on without making it a navigation destination.
 *
 * One promise up top, the two plans side by side, one button. The artwork is
 * small and quiet on purpose; the plans are what the page is for.
 */
export function ProUpgradeModal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isOpen = usePaywallStore((state) => state.isOpen);
  const close = usePaywallStore((state) => state.close);
  // A subscriber opens this from the Plan card to see what they pay for, so it
  // says "Current plan" where it would otherwise sell, as the web page does.
  const { isPro } = usePlanState();

  const storePlans = useStorePlans();
  const flow = usePurchaseFlow();
  const manage = useManageSubscription();
  /**
   * Which price is being shown. Starts monthly: it is the smaller number, and
   * the annual segment carries the saving that argues for the other one.
   */
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const isAnnual = interval === 'annual';
  const [closeRowHeight, setCloseRowHeight] = useState(0);

  const plans = storePlans.data ?? null;
  const prices = buildPaywallPrices(plans?.monthly, plans?.annual);
  const price = isAnnual ? prices.annual : prices.monthly;
  const selectedPlan = isAnnual ? plans?.annual : plans?.monthly;
  const unavailableReason = !isPurchasingSupported()
    ? 'In-app purchase isn’t set up in this build yet.'
    : storePlans.isPending
      ? 'Loading prices from the App Store…'
      : !selectedPlan
        ? 'Couldn’t load prices from the App Store. Close and try again.'
        : null;

  const dismiss = () => {
    flow.reset();
    manage.reset();
    close();
  };

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={dismiss} transparent={false}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Dismissing lives at the top left, reachable before any of the
            selling below it. It floats over the page rather than sitting
            above it, so the artwork can rise level with it. */}
        <View
          onLayout={(event) => setCloseRowHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            zIndex: 1,
            top: insets.top,
            left: 0,
            padding: theme.spacing.sm,
          }}
        >
          <LiquidGlassCloseButton onPress={dismiss} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: closeRowHeight,
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,
            gap: theme.spacing.xl,
          }}
        >
          {/* The artwork sits behind the top right and runs off the edge; the
              copy keeps to the left of it. */}
          <View>
            <View
              style={{
                position: 'absolute',
                // Up level with the close button, as in the mockup, so the
                // subtitle below runs clear of it.
                top: -Math.min(ART_LIFT, closeRowHeight),
                right: -theme.spacing.md,
              }}
            >
              <UpgradeIllustration width={ART_WIDTH} />
            </View>

            <View style={{ gap: theme.spacing.md, paddingRight: COPY_INSET }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 3,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.accentSubtle,
                }}
              >
                <Text variant="footnote" color="accent">
                  {isPro ? `You’re on ${PRO_PLAN_NAME}` : `Upgrade to ${PRO_PLAN_NAME}`}
                </Text>
              </View>
              <Text variant="display" accessibilityRole="header" style={HEADLINE}>
                Find time{'\n'}
                <Text variant="display" color="accent" style={HEADLINE}>
                  in seconds.
                </Text>
              </Text>
            </View>

            <Text variant="callout" color="secondary" style={{ marginTop: theme.spacing.md }}>
              Describe a meeting in plain words. BPlan checks your calendars for conflicts, then AI
              suggests the best open slots.
            </Text>
          </View>

          <BillingIntervalToggle
            value={interval}
            onChange={(next) => {
              // A failure on the other plan no longer applies; a payment does.
              if (flow.state.phase === 'failed' || flow.state.phase === 'nothing-to-restore') {
                flow.reset();
              }
              setInterval(next);
            }}
            savingsPercentage={prices.savingsPercentage}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <PlanTierCard
              name="Free"
              summary="The essentials"
              price={<RollingPrice value="$0" amount={0} />}
              period={isAnnual ? '/ year' : '/ month'}
              features={FREE_FEATURES}
            />
            <PlanTierCard
              name="Pro"
              summary="AI scheduling"
              badge="Most popular"
              highlighted
              price={<RollingPrice value={price.label} amount={price.amount} />}
              period={isAnnual ? '/ year' : '/ month'}
              features={PRO_FEATURES}
            />
          </View>
        </ScrollView>

        <PurchaseFooter
          isPro={isPro}
          priceNote={
            isAnnual
              ? `${prices.annual.label} billed yearly (${prices.annualPerMonthLabel}/mo). Save ${prices.savingsLabel}. ${RENEWAL_TERMS}`
              : `${prices.monthly.label} billed monthly. ${RENEWAL_TERMS}`
          }
          unavailableReason={unavailableReason}
          flow={flow.state}
          onPurchase={() => {
            if (selectedPlan) flow.purchase(selectedPlan);
          }}
          onRestore={flow.restore}
          onManage={isPurchasingSupported() ? () => manage.mutate() : null}
          isManaging={manage.isPending}
          manageNote={
            manage.data === false
              ? 'This subscription isn’t managed through the App Store. If you subscribed on the web, manage it from your account there.'
              : manage.isError
                ? 'Couldn’t open subscription settings. Please try again.'
                : null
          }
          onDone={dismiss}
        />
      </View>
    </Modal>
  );
}
