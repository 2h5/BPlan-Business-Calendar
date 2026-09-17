import { calculateBillingIntervalSavings, PLAN_COMPARISON, PRO_PLAN } from '@cal/domain';
import { Badge, Button, IconButton, Text, useTheme } from '@cal/ui';
import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BillingIntervalToggle, type BillingInterval } from './BillingIntervalToggle';
import { GoldText } from './GoldText';
import { RollingPrice } from './RollingPrice';
import { usePaywallStore } from '../../../store/paywall.store';

/** What the hero feature promises, in the words the website uses. */
const HERO = PRO_PLAN.features.find((feature) => feature.isHero);
const HERO_PILLS = ['Deterministic verification', '1-click slot booking', 'Timezone aware'];
/** Reflection interval for the gold text on this page. */
const CYCLE_MS = 3500;

/** What annual billing saves, as the web page works it out. */
const SAVINGS = calculateBillingIntervalSavings(PRO_PLAN.monthlyPrice, PRO_PLAN.annualPrice);
/** The annual price as a monthly figure, for the comparison in the price note. */
const ANNUAL_PER_MONTH = PRO_PLAN.annualPrice / 12;

/**
 * The upgrade prompt, mounted at the root so Settings can open it over
 * whichever tab the user is on without making it a navigation destination.
 */
export function ProUpgradeModal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isOpen = usePaywallStore((state) => state.isOpen);
  const close = usePaywallStore((state) => state.close);

  /** Set when the upgrade button is pressed — see the note it reveals. */
  const [showPurchaseNote, setShowPurchaseNote] = useState(false);
  /**
   * Which price is being shown. Starts monthly: it is the smaller number, and
   * the annual segment carries the saving that argues for the other one.
   */
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const isAnnual = interval === 'annual';

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
            selling below it. */}
        <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
          <IconButton name="close" accessibilityLabel="Dismiss" onPress={dismiss} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ alignSelf: 'flex-start', marginBottom: theme.spacing.xs }}>
              <Badge label="Most Popular" tone="accent" />
            </View>
            <GoldText variant="title1" cycleMs={CYCLE_MS}>
              BPlan Pro
            </GoldText>
            <Text variant="callout" color="secondary">
              {PRO_PLAN.tagline}
            </Text>
          </View>

          <BillingIntervalToggle
            value={interval}
            onChange={setInterval}
            savingsPercentage={SAVINGS.savingsPercentage}
          />

          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs }}>
              <RollingPrice
                value={`$${(isAnnual ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice).toFixed(2)}`}
                amount={isAnnual ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice}
              />
              <Text variant="body" color="secondary">
                {isAnnual ? '/ year' : '/ month'}
              </Text>
            </View>
            <Text variant="footnote" color="tertiary">
              {isAnnual
                ? `Billed annually ($${ANNUAL_PER_MONTH.toFixed(2)}/mo). Save $${SAVINGS.savingsDollars.toFixed(2)}/year.`
                : 'Billed monthly. Cancel anytime with no long-term commitment.'}
            </Text>
          </View>

          {HERO ? (
            <View
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.lg,
                borderWidth: theme.borderWidth.hairline,
                borderColor: theme.colors.accentMuted,
                backgroundColor: theme.colors.accentSubtle,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="bodyStrong" color="accent">
                  {HERO.name}
                </Text>
                <Badge label="Hero feature" tone="accent" />
              </View>

              <Text variant="footnote" color="secondary">
                Describe your meeting in plain English. The server deterministically calculates
                valid, unconflicted slots so times are never hallucinated, then AI ranks and
                explains the best open opportunities for you.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {HERO_PILLS.map((pill) => (
                  <View
                    key={pill}
                    style={{
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: 4,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surfaceRaised,
                    }}
                  >
                    <Text variant="caption" color="secondary">
                      {`✦ ${pill}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.md }}>
            {PRO_PLAN.features
              .filter((feature) => !feature.isHero)
              .map((feature) => (
                <View
                  key={feature.id}
                  style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}
                >
                  <Text variant="body" color="success">
                    ✓
                  </Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{feature.name}</Text>
                    <Text variant="footnote" color="secondary">
                      {feature.description}
                    </Text>
                  </View>
                </View>
              ))}
          </View>

          {PRO_PLAN.futureFeatures && PRO_PLAN.futureFeatures.length > 0 ? (
            <View
              style={{
                gap: theme.spacing.xs,
                paddingTop: theme.spacing.md,
                borderTopWidth: theme.borderWidth.hairline,
                borderTopColor: theme.colors.borderSubtle,
              }}
            >
              <Text variant="caption" color="tertiary">
                UPCOMING PRO CAPABILITIES
              </Text>
              {PRO_PLAN.futureFeatures.map((item) => (
                <Text key={item} variant="footnote" color="secondary">
                  {`•  ${item}`}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">Detailed plan comparison</Text>
            <Text variant="footnote" color="tertiary">
              The exact differences between the tiers.
            </Text>

            <View
              style={{
                borderRadius: theme.radius.lg,
                borderWidth: theme.borderWidth.hairline,
                borderColor: theme.colors.borderSubtle,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  backgroundColor: theme.colors.surfaceRaised,
                }}
              >
                <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
                  CAPABILITY
                </Text>
                <Text variant="caption" color="tertiary" style={{ width: 52, textAlign: 'center' }}>
                  FREE
                </Text>
                <Text variant="caption" color="tertiary" style={{ width: 76, textAlign: 'center' }}>
                  PRO
                </Text>
              </View>

              {PLAN_COMPARISON.map((row, index) => (
                <View
                  key={row.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    borderTopWidth: index === 0 ? 0 : theme.borderWidth.hairline,
                    borderTopColor: theme.colors.borderSubtle,
                  }}
                >
                  <Text variant="footnote" style={{ flex: 1 }}>
                    {row.capability}
                  </Text>
                  <Text
                    variant="footnote"
                    color={row.inFree ? 'success' : 'tertiary'}
                    style={{ width: 52, textAlign: 'center' }}
                  >
                    {row.inFree ? '✓' : '—'}
                  </Text>
                  <Text
                    variant="caption"
                    color="success"
                    style={{ width: 76, textAlign: 'center' }}
                  >
                    {row.proLabel ? `✓ ${row.proLabel}` : '✓'}
                  </Text>
                </View>
              ))}
            </View>
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
          {/* The button names the price it would charge, so the choice above
              cannot be lost by the time the decision is made. */}
          <Button
            label={
              isAnnual
                ? `Upgrade to Pro — $${PRO_PLAN.annualPrice.toFixed(2)}/year`
                : `Upgrade to Pro — $${PRO_PLAN.monthlyPrice.toFixed(2)}/month`
            }
            fullWidth
            onPress={() => setShowPurchaseNote(true)}
          />
          {showPurchaseNote ? (
            // Honest rather than decorative: there is no purchase SDK in this
            // build, so the button cannot open a real checkout yet.
            <Text variant="footnote" color="tertiary" align="center">
              In-app purchase is not set up in this build yet.
            </Text>
          ) : null}
          <Button label="Maybe later" variant="ghost" fullWidth onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}
