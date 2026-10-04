import { Badge, Button, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { SearchIllustration } from './SearchIllustration';
import {
  splitHighlight,
  type SearchResultItem,
  type SearchResultSection,
  type SearchResultTone,
  type SearchStatus,
} from '../utils/search-results';

interface SearchResultsProps {
  status: SearchStatus;
  query: string;
  sections: SearchResultSection[];
  isRefreshing: boolean;
  onOpen: (item: SearchResultItem) => void;
  onRetry: () => void;
}

/** Rows past this index enter together rather than extending the stagger. */
const STAGGER_CAP = 12;

/** The body of the Search panel: one view per search status. */
export function SearchResults({
  status,
  query,
  sections,
  isRefreshing,
  onOpen,
  onRetry,
}: SearchResultsProps) {
  const theme = useTheme();

  if (status === 'idle') {
    return (
      <View
        key="idle"
        accessibilityRole="summary"
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.lg,
          paddingHorizontal: theme.spacing.xl,
        }}
      >
        <SearchIllustration />
        <Text variant="headline" color="secondary" style={{ fontWeight: '500' }}>
          Start typing to search
        </Text>
        <Text variant="footnote" color="tertiary" align="center">
          Search by title, notes, or location.
        </Text>
      </View>
    );
  }

  if (status === 'short') {
    return (
      <SearchState key="short" title="Keep typing" body="Search starts after two characters." />
    );
  }

  if (status === 'loading') {
    return (
      <View
        key="loading"
        accessibilityRole="progressbar"
        accessibilityLabel="Searching"
        style={{ padding: theme.spacing.sm }}
      >
        {[0, 1, 2, 3].map((index) => (
          <SkeletonRow key={index} index={index} />
        ))}
      </View>
    );
  }

  if (status === 'error') {
    return (
      <SearchState
        key="error"
        title="Search could not load"
        body="Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }

  if (status === 'empty') {
    return (
      <SearchState
        key="empty"
        title={`No matches for “${query}”`}
        body="Try a word from the title, notes, or location."
      />
    );
  }

  let rowCount = 0;
  return (
    <View
      key="results"
      accessibilityLabel="Search results"
      style={{ padding: theme.spacing.sm, opacity: isRefreshing ? 0.55 : 1 }}
    >
      {sections.map((section, sectionIndex) => (
        <View
          key={section.kind}
          style={
            sectionIndex > 0
              ? {
                  marginTop: theme.spacing.sm,
                  paddingTop: theme.spacing.sm,
                  borderTopWidth: theme.borderWidth.hairline,
                  borderTopColor: theme.colors.borderSubtle,
                }
              : undefined
          }
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              paddingTop: theme.spacing.sm,
              paddingBottom: 6,
            }}
          >
            <Text variant="caption" color="tertiary" uppercase style={{ letterSpacing: 0.9 }}>
              {section.title}
            </Text>
            <Text variant="caption" color="tertiary" style={{ opacity: 0.7 }}>
              {section.total >= 40 ? '40+' : section.total}
            </Text>
          </View>
          {section.items.map((item) => (
            <ResultRow
              key={item.key}
              item={item}
              query={query}
              index={rowCount++}
              onOpen={onOpen}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function ResultRow({
  item,
  query,
  index,
  onOpen,
}: {
  item: SearchResultItem;
  query: string;
  index: number;
  onOpen: (item: SearchResultItem) => void;
}) {
  const theme = useTheme();
  const toneColor = useToneColor();
  const kindColor = item.kind === 'event' ? theme.colors.accent : theme.colors.success;
  const iconColor = item.color ?? kindColor;

  return (
    <Animated.View
      entering={FadeInDown.duration(240 * theme.motion.scale)
        .delay(Math.min(index, STAGGER_CAP) * 20 * theme.motion.scale)
        .withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] })}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.primary}`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          paddingVertical: 10,
          paddingHorizontal: theme.spacing.md,
          borderRadius: 10,
          backgroundColor: pressed ? theme.colors.hover : 'transparent',
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 9,
            borderWidth: theme.borderWidth.hairline,
            borderColor: item.color ? withAlpha(item.color, 0.24) : theme.colors.borderSubtle,
            backgroundColor: item.color ? withAlpha(item.color, 0.12) : theme.colors.surfaceRaised,
            opacity: item.isMuted ? 0.55 : 1,
          }}
        >
          <Ionicons
            name={item.kind === 'event' ? 'calendar-outline' : 'checkmark-circle-outline'}
            size={17}
            color={iconColor}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3, paddingTop: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <RNText
              numberOfLines={1}
              style={{
                ...theme.typography.callout,
                flexShrink: 1,
                fontWeight: '500',
                letterSpacing: -0.08,
                color: item.isMuted ? theme.colors.textSecondary : theme.colors.textPrimary,
                textDecorationLine: item.kind === 'task' && item.isMuted ? 'line-through' : 'none',
              }}
            >
              <Highlighted text={item.title} query={query} />
            </RNText>
            {item.badges.map((badge) => (
              <Badge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </View>

          <RNText
            numberOfLines={1}
            style={{
              ...theme.typography.footnote,
              color: theme.colors.textTertiary,
              fontVariant: ['tabular-nums'],
            }}
          >
            <RNText
              style={{
                color: toneColor(item.primaryTone),
                fontWeight: item.primaryTone === 'neutral' ? '400' : '500',
              }}
            >
              {item.primary}
            </RNText>
            {item.details.map((detail) => ` · ${detail}`).join('')}
          </RNText>

          {item.snippet ? (
            <RNText
              numberOfLines={2}
              style={{
                ...theme.typography.footnote,
                marginTop: 2,
                paddingLeft: theme.spacing.sm,
                borderLeftWidth: 2,
                borderLeftColor: theme.colors.border,
                color: theme.colors.textTertiary,
              }}
            >
              <Highlighted text={item.snippet} query={query} />
            </RNText>
          ) : null}
        </View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.textTertiary}
          style={{ alignSelf: 'center', opacity: 0.6 }}
        />
      </Pressable>
    </Animated.View>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const theme = useTheme();

  return (
    <>
      {splitHighlight(text, query).map((segment, index) =>
        segment.isMatch ? (
          <RNText
            key={index}
            style={{ backgroundColor: withAlpha(theme.colors.accent, 0.22), borderRadius: 2 }}
          >
            {segment.text}
          </RNText>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

function SkeletonRow({ index }: { index: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 600 * theme.motion.scale, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion, theme.motion.scale]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const block = { backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.sm };

  return (
    <Animated.View
      entering={FadeIn.duration(200 * theme.motion.scale).delay(index * 60 * theme.motion.scale)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: 10,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Animated.View style={[{ ...block, width: 32, height: 32, borderRadius: 9 }, style]} />
      <View style={{ flex: 1, gap: 7 }}>
        <Animated.View style={[{ ...block, width: '52%', height: 10 }, style]} />
        <Animated.View style={[{ ...block, width: '34%', height: 8 }, style]} />
      </View>
    </Animated.View>
  );
}

function SearchState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(180 * theme.motion.scale)}
      accessibilityRole={onRetry ? 'alert' : 'summary'}
      style={{
        minHeight: 132,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.xxl,
      }}
    >
      <Text variant="subhead" style={{ fontWeight: '600' }} align="center">
        {title}
      </Text>
      <Text variant="footnote" color="tertiary" align="center">
        {body}
      </Text>
      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          size="sm"
          onPress={onRetry}
          style={{ marginTop: theme.spacing.md }}
        />
      ) : null}
    </Animated.View>
  );
}

function useToneColor() {
  const theme = useTheme();
  const colors: Record<SearchResultTone, string> = {
    accent: theme.colors.accent,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    success: theme.colors.success,
    neutral: theme.colors.textSecondary,
  };
  return (tone: SearchResultTone) => colors[tone];
}

/** `#RRGGBB` at the given opacity; other colour formats pass through unchanged. */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const channel = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${channel}`;
}
