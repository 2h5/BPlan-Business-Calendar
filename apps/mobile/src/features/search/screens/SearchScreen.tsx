import { Text, useTheme } from '@cal/ui';
import { useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackButton } from '../../../components/app-shell/GlassBackButton';
import { useEventEditorStore } from '../../../store/event-editor.store';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useProfile } from '../../settings/hooks/useProfile';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import { SearchBackdrop } from '../components/SearchBackdrop';
import { SearchField } from '../components/SearchField';
import { SearchResults } from '../components/SearchResults';
import { useSearch } from '../hooks/useSearch';
import {
  buildSearchSections,
  resolveSearchStatus,
  type SearchResultItem,
} from '../utils/search-results';

/** Matches the web page: long enough to skip mid-word queries, short enough to feel live. */
const DEBOUNCE_MS = 220;

/** The panel grows and shrinks to each new view, as the web viewport does. */
const panelResizeFor = (motionScale: number) =>
  LinearTransition.duration(280 * motionScale).easing(Easing.bezier(0.22, 1, 0.36, 1));

/** The slice of the native-stack navigator this screen listens to. */
interface StackTransitionEvents {
  addListener(
    type: 'transitionEnd',
    listener: (event: { data: { closing: boolean } }) => void,
  ): () => void;
}

/** Search events and tasks by the words users actually remember. */
export function SearchScreen() {
  const theme = useTheme();
  const panelResize = useMemo(() => panelResizeFor(theme.motion.scale), [theme.motion.scale]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const normalized = query.trim();
  const [debounced, setDebounced] = useState('');
  const search = useSearch(debounced);
  const { data: profile } = useProfile();
  const lists = useTaskLists();
  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openTask = useTaskEditorStore((state) => state.openTask);
  const timeZone = profile?.timezone ?? 'UTC';
  const hourCycle = profile?.hourCycle ?? 'h23';
  const navigation = useNavigation<StackTransitionEvents>();
  const [hasEntered, setHasEntered] = useState(false);

  // Raise the keyboard only once the push settles: focusing mid-push makes iOS
  // carry the keyboard in sideways with the page instead of up from the bottom.
  useEffect(
    () =>
      navigation.addListener('transitionEnd', (event) => {
        if (!event.data.closing) setHasEntered(true);
      }),
    [navigation],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalized]);

  const sections = useMemo(
    () =>
      search.data && debounced.length >= 2
        ? buildSearchSections(search.data, {
            query: debounced,
            now: new Date(),
            timeZone,
            hourCycle,
            lists: lists.data ?? [],
          })
        : [],
    [debounced, hourCycle, lists.data, search.data, timeZone],
  );
  const itemCount = sections.reduce((count, section) => count + section.items.length, 0);

  const isSearching = normalized.length >= 2 && (debounced !== normalized || search.isFetching);
  const status = resolveSearchStatus({
    query: normalized,
    isSearching,
    isError: search.isError,
    itemCount,
  });

  const openItem = (item: SearchResultItem) =>
    item.kind === 'event' ? openEvent(item.id) : openTask(item.id);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <SearchBackdrop />

      <View
        style={{
          paddingTop: insets.top + theme.spacing.xs,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <GlassBackButton />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          gap: theme.spacing.xl,
        }}
      >
        <Animated.View
          entering={FadeIn.duration(240 * theme.motion.scale)}
          style={{ gap: theme.spacing.xs }}
        >
          <Text variant="title1" accessibilityRole="header">
            Find anything
          </Text>
          <Text variant="footnote" color="tertiary">
            Tasks and events across your BPlan workspace.
          </Text>
        </Animated.View>

        <SearchField
          value={query}
          onChangeText={setQuery}
          isSearching={isSearching}
          shouldFocus={hasEntered}
        />

        <Animated.View
          layout={panelResize}
          style={{
            overflow: 'hidden',
            borderRadius: theme.radius.xl,
            borderWidth: theme.borderWidth.hairline,
            borderColor: theme.colors.borderSubtle,
            backgroundColor: theme.colors.surface,
          }}
        >
          <SearchResults
            status={status}
            query={debounced}
            sections={sections}
            isRefreshing={isSearching}
            onOpen={openItem}
            onRetry={() => void search.refetch()}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
