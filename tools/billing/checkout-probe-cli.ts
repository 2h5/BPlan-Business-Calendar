import { runCheckoutProbeCommand } from './checkout-probe-command';

runCheckoutProbeCommand({
  environment: process.env,
  argv: process.argv.slice(2),
}).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  () => {
    process.stdout.write(
      'RevenueCat sandbox checkout probe\n\nFailure....................... SAFETY\nResult: FAIL\n',
    );
    process.exitCode = 1;
  },
);
