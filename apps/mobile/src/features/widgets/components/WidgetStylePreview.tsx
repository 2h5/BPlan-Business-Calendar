import { Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

export type WidgetStyle = 'standard' | 'glass';

/**
 * A miniature of the Home Screen widget in one of its two looks, painted in
 * fixed colours rather than the app theme — the point is to show what the
 * Home Screen will look like, whatever theme the app is in.
 */
export function WidgetStylePreview({ style }: { style: WidgetStyle }) {
  const theme = useTheme();
  const glass = style === 'glass';

  return (
    <View style={{ flex: 1, gap: theme.spacing.sm }}>
      <View
        style={{
          height: 88,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          padding: theme.spacing.sm,
          // A stand-in wallpaper, so the glass tile has something to show through.
          backgroundColor: '#2E2C63',
        }}
      >
        <Wallpaper />
        <View
          style={{
            flex: 1,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
            gap: 5,
            backgroundColor: glass ? 'rgba(255, 255, 255, 0.14)' : '#13171E',
            borderWidth: glass ? 1 : 0,
            borderColor: 'rgba(255, 255, 255, 0.28)',
          }}
        >
          <Line width="38%" color={glass ? '#FFFFFF' : '#196AF3'} height={3} />
          <Line width="55%" color="#F3F5F8" height={5} />
          <EventLine color="#3ECF8E" />
          <EventLine color="#6E8BFF" />
        </View>
      </View>
      <Text variant="footnote" color="secondary" align="center" style={{ fontWeight: '600' }}>
        {glass ? 'Liquid Glass' : 'Standard'}
      </Text>
    </View>
  );
}

function Wallpaper() {
  return (
    <>
      <Blob color="#6D5BD0" size={90} top={-30} left={-20} />
      <Blob color="#3A7BD5" size={80} top={30} left={70} />
      <Blob color="#B061C9" size={70} top={-10} left={110} />
    </>
  );
}

function Blob({
  color,
  size,
  top,
  left,
}: {
  color: string;
  size: number;
  top: number;
  left: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.55,
      }}
    />
  );
}

function Line({ width, color, height }: { width: `${number}%`; color: string; height: number }) {
  return <View style={{ width, height, borderRadius: height / 2, backgroundColor: color }} />;
}

/** A coloured bar and a title line: the shape of an event row. */
function EventLine({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 2, height: 10, borderRadius: 1, backgroundColor: color }} />
      <Line width="60%" color="rgba(243, 245, 248, 0.75)" height={4} />
    </View>
  );
}
