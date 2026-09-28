import { TextField, useTheme, type TextFieldProps } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { FieldIcon } from './FieldIcon';

/** A password field with a lock glyph and a show/hide toggle. */
export function PasswordField(
  props: Omit<TextFieldProps, 'secureTextEntry' | 'leading' | 'trailing'>,
) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      secureTextEntry={!visible}
      leading={<FieldIcon name="lock-closed-outline" />}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={theme.spacing.sm}
          onPress={() => setVisible((value) => !value)}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.textTertiary}
          />
        </Pressable>
      }
    />
  );
}
