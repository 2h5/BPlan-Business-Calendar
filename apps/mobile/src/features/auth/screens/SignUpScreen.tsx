import { type SignUpInput, signUpSchema } from '@cal/schemas';
import { Button, Screen, Text, TextField, useTheme } from '@cal/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { APP_NAME } from '../../../lib/brand';
import { toAppError } from '../../../lib/errors/app-error';
import { AppleSignInButton } from '../components/AppleSignInButton';
import { AuthBackdrop } from '../components/AuthBackdrop';
import { AuthDivider } from '../components/AuthDivider';
import { AuthHeader } from '../components/AuthHeader';
import { AuthSwitchLink } from '../components/AuthSwitchLink';
import { FieldIcon } from '../components/FieldIcon';
import { PasswordField } from '../components/PasswordField';
import { useAuthActions } from '../hooks/useAuthActions';

export function SignUpScreen() {
  const theme = useTheme();
  const { signUp, apple } = useAuthActions();

  const { control, handleSubmit } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const submitError = signUp.error ? toAppError(signUp.error) : null;

  return (
    <Screen backdrop={<AuthBackdrop />}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ gap: theme.spacing.xxl }}
      >
        <AuthHeader
          eyebrow={`${APP_NAME} workspace`}
          title="Create your"
          titleAccent="account"
          subtitle="Your calendar and your to-do list, finally in the same place."
        />

        <View style={{ gap: theme.spacing.lg }}>
          <Controller
            control={control}
            name="fullName"
            render={({ field, fieldState }) => (
              <TextField
                label="Name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoComplete="name"
                textContentType="name"
                placeholder="Alex Rivera"
                leading={<FieldIcon name="person-outline" />}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                leading={<FieldIcon name="mail-outline" />}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordField
                label="Password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                hint="At least 8 characters."
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Create a password"
              />
            )}
          />

          {submitError ? (
            <Text variant="footnote" color="danger">
              {submitError.message}
            </Text>
          ) : null}

          <Button
            label="Create account"
            fullWidth
            loading={signUp.isPending}
            onPress={handleSubmit((values) => signUp.mutate(values))}
          />
        </View>

        <AuthDivider />

        <AppleSignInButton onPress={() => apple.mutate()} disabled={apple.isPending} />

        <AuthSwitchLink prompt="Already have an account?" action="Sign in" href="/(auth)/sign-in" />
      </KeyboardAvoidingView>
    </Screen>
  );
}
