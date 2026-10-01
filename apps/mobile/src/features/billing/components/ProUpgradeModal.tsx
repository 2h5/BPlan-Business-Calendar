import { calculateBillingIntervalSavings, PRO_PLAN } from '@cal/domain';
import { Button, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, ScrollView, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BillingIntervalToggle, type BillingInterval } from './BillingIntervalToggle';
import { LiquidGlassCloseButton } from './LiquidGlassCloseButton';
import { PlanTierCard } from './PlanTierCard';
import { RollingPrice } from './RollingPrice';
import { UpgradeIllustration } from './UpgradeIllustration';
import { PRO_PLAN_NAME } from '../../../lib/brand';
import { usePaywallStore } from '../../../store/paywall.store';
import { usePlanState } from '../hooks/useSubscription';

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

/** What annual billing saves, as the web page works it out. */
const SAVINGS = calculateBillingIntervalSavings(PRO_PLAN.monthlyPrice, PRO_PLAN.annualPrice);
/** The annual price as a monthly figure, for the comparison in the price note. */
const ANNUAL_PER_MONTH = PRO_PLAN.annualPrice / 12;

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

  /** Set when the upgrade button is pressed — see the note it reveals. */
  const [showPurchaseNote, setShowPurchaseNote] = useState(false);
  /**
   * Which price is being shown. Starts monthly: it is the smaller number, and
   * the annual segment carries the saving that argues for the other one.
   */
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const isAnnual = interval === 'annual';
  const [closeRowHeight, setCloseRowHeight] = useState(0);

  const dismiss = () => {
    setShowPurchaseNote(false);
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
            onChange={setInterval}
            savingsPercentage={SAVINGS.savingsPercentage}
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
              price={
                <RollingPrice
                  value={`$${(isAnnual ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice).toFixed(2)}`}
                  amount={isAnnual ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice}
                />
              }
              period={isAnnual ? '/ year' : '/ month'}
              features={PRO_FEATURES}
            />
          </View>
        </ScrollView>

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
              label="Continue with Pro"
              size="lg"
              fullWidth
              trailingIcon={
                <Ionicons name="arrow-forward" size={18} color={theme.colors.onAccent} />
              }
              onPress={() => setShowPurchaseNote(true)}
            />
          )}
          {/* What the button would charge, so the choice above is never lost. */}
          <Text variant="footnote" color="tertiary" align="center">
            {isAnnual
              ? `$${PRO_PLAN.annualPrice.toFixed(2)} billed yearly ($${ANNUAL_PER_MONTH.toFixed(2)}/mo). Save $${SAVINGS.savingsDollars.toFixed(2)}.`
              : `$${PRO_PLAN.monthlyPrice.toFixed(2)} billed monthly. Cancel anytime.`}
          </Text>
          {!isPro && showPurchaseNote ? (
            // Honest rather than decorative: there is no purchase SDK in this
            // build, so the button cannot open a real checkout yet.
            <Text variant="footnote" color="tertiary" align="center">
              In-app purchase is not set up in this build yet.
            </Text>
          ) : null}
          {isPro ? <Button label="Done" variant="ghost" fullWidth onPress={dismiss} /> : null}
        </View>
      </View>
    </Modal>
  );
}
