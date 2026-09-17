import { PRO_PLAN, type SubscriptionStatusInfo } from '@cal/domain';
import { Badge, Button, Card, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, type ViewStyle } from 'react-native';

import { usePaywallStore } from '../../../store/paywall.store';
import { GoldText } from '../../billing/components/GoldText';
import { usePlanState, useSubscription } from '../../billing/hooks/useSubscription';

const TITLE = 'Upgrade to BPlan Pro';
const SUBTITLE = 'Unlock Find Time with AI';
/** This row keeps its own three-second rhythm; the upgrade page uses 3.5s. */
const CYCLE_MS = 3000;
/**
 * The plan's own name, rather than the shared status label ("Pro Active") —
 * that label describes the state, which the badge beside it already says. This
 * is the name used everywhere else the product sells or mentions the plan.
 */
const PLAN_NAME = 'BPlan Pro';
/**
 * What the card says under the plan state. The shared status text swaps in the
 * renewal date when there is one; this card wants the same sentence every time,
 * because the date is the plans page's business rather than a settings row's.
 */
const ACTIVE_DESCRIPTION = 'Your Pro subscription is active with full access to all AI features.';

/**
 * What the account's plan is, in the one place a person looks for it.
 *
 * Two cards, never both: an account without Pro gets the way back to the
 * upgrade page — the launch prompt can be dismissed and does not return until
 * the next launch, so without this there would be no route to the plans — and
 * an account with Pro gets its status instead. Selling Pro to somebody already
 * paying for it is the thing to avoid; saying nothing at all, which is what
 * this card used to do, left them with no way to check what they are on.
 */
export function PlanCard() {
  const { isPro, isLoading, info } = usePlanState();

  // Not knowing yet is not the same as being on the free plan, and guessing
  // wrong in either direction misinforms someone about what they pay for.
  if (isLoading) return null;

  return isPro ? <ProStatusCard info={info} /> : <UpgradeRow />;
}

/**
 * The status readout for a subscriber, drawn as the web subscription page's
 * status banner: a lit dot, the plan state with its badge, the sentence that
 * explains it, and a way to re-check.
 *
 * The refresh is here because entitlement changes arrive by webhook — someone
 * who has just paid, or just renewed, would otherwise wait out the query's
 * stale time before the card believed them. On a phone the button sits under
 * the text, where the web banner also puts it once the page is narrow.
 */
function ProStatusCard({ info }: { info: SubscriptionStatusInfo }) {
  const theme = useTheme();
  const { refetch, isFetching } = useSubscription();

  const dotColor: Record<SubscriptionStatusInfo['badgeVariant'], string> = {
    neutral: theme.colors.textTertiary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  };
  const dot = dotColor[info.badgeVariant];

  return (
    <Card eyebrow="Plan">
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 10,
              height: 10,
              borderRadius: theme.radius.pill,
              backgroundColor: dot,
              // The web's glow; a lone colour reads as a bullet, not a light.
              shadowColor: dot,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: info.badgeVariant === 'neutral' ? 0 : 0.5,
              shadowRadius: 4,
            }}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text variant="bodyStrong">{PLAN_NAME}</Text>
              <Badge label={info.state} tone={info.badgeVariant} />
            </View>
            <Text variant="footnote" color="tertiary">
              {ACTIVE_DESCRIPTION}
            </Text>
          </View>
        </View>

        <Button
          label={isFetching ? 'Refreshing…' : 'Refresh access status'}
          variant="secondary"
          size="sm"
          disabled={isFetching}
          leadingIcon={<Ionicons name="refresh" size={14} color={theme.colors.textPrimary} />}
          onPress={() => void refetch()}
        />
      </View>
    </Card>
  );
}

/**
 * The row is built here rather than with `ListRow` because its title has to be
 * animated, and `ListRow` takes a plain string; the metrics below mirror it.
 */
function UpgradeRow() {
  const theme = useTheme();
  const openPaywall = usePaywallStore((state) => state.open);

  const layout: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.hitSlopSize + theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  };

  return (
    <Card eyebrow="Plan" padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${TITLE}, ${SUBTITLE}`}
        onPress={openPaywall}
        style={({ pressed }) => [layout, pressed && { backgroundColor: theme.colors.hover }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <GoldText variant="bodyStrong" cycleMs={CYCLE_MS}>
            {TITLE}
          </GoldText>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {SUBTITLE}
          </Text>
        </View>

        <Text variant="footnote" color="tertiary">
          {`$${PRO_PLAN.monthlyPrice.toFixed(2)} / mo`}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </Pressable>
    </Card>
  );
}
