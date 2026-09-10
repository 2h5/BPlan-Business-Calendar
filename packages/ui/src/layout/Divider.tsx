import { View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export interface DividerProps {
  /** Indents the rule so it aligns with row text rather than the card edge. */
  inset?: boolean;
  style?: ViewStyle;
}

export function Divider({ inset = false, style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          height: theme.borderWidth.hairline,
          backgroundColor: theme.colors.borderSubtle,
          marginLeft: inset ? theme.spacing.xl : 0,
        },
        style,
      ]}
    />
  );
}
