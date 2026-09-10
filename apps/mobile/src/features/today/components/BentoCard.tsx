import { Text, useTheme, type IconName } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

export type BentoTone = 'accent' | 'focus' | 'success';
export type BentoPillTone = 'active' | 'soon' | 'overdue' | 'done';

export interface BentoCardProps {
  /** Plain uppercase label, replaced by `pill` when one is given. */
  eyebrow: string;
  pill?: { label: string; tone: BentoPillTone };
  icon: IconName;
  iconTone: BentoTone;
  /** The headline number or phrase. */
  value: string;
  meta: string;
  /** Small colour dot before `meta`, e.g. the calendar's colour. */
  metaDotColor?: string;
  progress?: { percent: number; label: string; tone: BentoTone };
  /** Draws the card in the "happening now" state. */
  highlighted?: boolean;
  onPress?: () => void;
  footer?: ReactNode;
}

/**
 * One tile of the web's bento grid. On a phone the three tiles stack, so the
 * card keeps its own minimum height rather than relying on a grid row to make
 * the three agree.
 */
export function BentoCard({
  eyebrow,
  pill,
  icon,
  iconTone,
  value,
  meta,
  metaDotColor,
  progress,
  highlighted = false,
  onPress,
  footer,
}: BentoCardProps) {
  const theme = useTheme();

  const toneColor: Record<BentoTone, { fg: string; bg: string }> = {
    accent: { fg: theme.colors.accent, bg: theme.colors.accentSubtle },
    focus: { fg: theme.colors.focusAccent, bg: theme.colors.focusAccentSubtle },
    success: { fg: theme.colors.success, bg: theme.colors.successSubtle },
  };

  const surface: ViewStyle = {
    minHeight: 132,
    padding: theme.spacing.lg,
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.hairline,
    borderColor: highlighted ? theme.colors.successSubtle : theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  };

  const content = (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        {pill ? (
          <BentoPill label={pill.label} tone={pill.tone} />
        ) : (
          <BentoEyebrow label={eyebrow} />
        )}

        <View
          style={{
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 7,
            backgroundColor: toneColor[iconTone].bg,
          }}
        >
          <Ionicons name={icon} size={15} color={toneColor[iconTone].fg} />
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="title3" numberOfLines={1} style={{ fontWeight: '700' }}>
          {value}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          {metaDotColor ? (
            <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: metaDotColor }} />
          ) : null}
          <Text variant="footnote" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {meta}
          </Text>
        </View>
      </View>

      {progress ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.surfaceElevated,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max(0, Math.min(100, progress.percent))}%`,
                height: '100%',
                borderRadius: 2,
                backgroundColor: toneColor[progress.tone].fg,
              }}
            />
          </View>
          <Text variant="mono" color="tertiary" style={{ fontSize: 11 }}>
            {progress.label}
          </Text>
        </View>
      ) : null}

      {footer}
    </>
  );

  if (!onPress) return <View style={surface}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pill?.label ?? eyebrow}: ${value}. ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [
        surface,
        pressed && { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.hover },
      ]}
    >
      {content}
    </Pressable>
  );
}

function BentoEyebrow({ label }: { label: string }) {
  return (
    <Text variant="caption" color="tertiary" uppercase numberOfLines={1} style={{ flexShrink: 1 }}>
      {label}
    </Text>
  );
}

function BentoPill({ label, tone }: { label: string; tone: BentoPillTone }) {
  const theme = useTheme();

  const palette: Record<BentoPillTone, { fg: string; bg: string; dot: boolean }> = {
    active: { fg: theme.colors.success, bg: theme.colors.successSubtle, dot: true },
    soon: { fg: theme.colors.accent, bg: theme.colors.accentSubtle, dot: false },
    overdue: { fg: theme.colors.danger, bg: theme.colors.dangerSubtle, dot: false },
    done: { fg: theme.colors.success, bg: theme.colors.successSubtle, dot: false },
  };

  const { fg, bg, dot } = palette[tone];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 1,
        paddingHorizontal: 6,
        borderRadius: 3,
        backgroundColor: bg,
        flexShrink: 1,
      }}
    >
      {dot ? <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: fg }} /> : null}
      <Text variant="caption" numberOfLines={1} style={{ color: fg, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}
