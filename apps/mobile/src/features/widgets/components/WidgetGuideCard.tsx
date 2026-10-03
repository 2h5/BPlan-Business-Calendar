import { Card, Text, useTheme } from '@cal/ui';
import { Platform, View } from 'react-native';

import { WidgetStylePreview } from './WidgetStylePreview';
import { APP_NAME } from '../../../lib/brand';

const ADD_STEPS = [
  'Touch and hold an empty spot on your Home Screen.',
  `Tap Edit, then Add Widget, and choose ${APP_NAME}.`,
  'To pick the view it opens on, touch and hold the widget and tap Edit Widget.',
];

const GLASS_STEPS = ['On the Home Screen, tap Edit, then Customize.', 'Choose Clear.'];

/**
 * How to add the Home Screen widget and give it the Liquid Glass look.
 *
 * Glass is a Home Screen style the person picks for every widget at once —
 * iOS gives apps no switch for it (see docs/widgets.md) — so this card shows
 * the two looks and the steps rather than offering a toggle that could not
 * work. iOS only: the widget does not exist anywhere else.
 */
export function WidgetGuideCard() {
  const theme = useTheme();
  if (Platform.OS !== 'ios') return null;

  return (
    <Card
      eyebrow="Home Screen widget"
      description="See your month, week, and day, and tick off tasks, without opening the app."
      padded={false}
    >
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <WidgetStylePreview style="standard" />
          <WidgetStylePreview style="glass" />
        </View>

        <Steps title="Add the widget" steps={ADD_STEPS} />
        <Steps
          title="Get the Liquid Glass look"
          steps={GLASS_STEPS}
          note={`This changes every widget and icon on your Home Screen. ${APP_NAME} keeps your calendar colours on glass.`}
        />
      </View>
    </Card>
  );
}

function Steps({ title, steps, note }: { title: string; steps: string[]; note?: string }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead">{title}</Text>
      {steps.map((step, index) => (
        <View key={step} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: theme.radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentSubtle,
            }}
          >
            <Text variant="caption" style={{ color: theme.colors.accent, fontWeight: '700' }}>
              {index + 1}
            </Text>
          </View>
          <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
            {step}
          </Text>
        </View>
      ))}
      {note ? (
        <Text variant="footnote" color="tertiary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}
