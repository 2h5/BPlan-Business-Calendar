import { useTheme } from '@cal/ui';
import { View } from 'react-native';

export interface NowIndicatorProps {
  /** Distance from the top of the hour grid to the current minute. */
  top: number;
}

/** The current-time line drawn across a timeline column, led by a dot. */
export function NowIndicator({ top }: NowIndicatorProps) {
  const theme = useTheme();

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: top - 4,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.nowIndicator,
        }}
      />
      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.nowIndicator }} />
    </View>
  );
}
