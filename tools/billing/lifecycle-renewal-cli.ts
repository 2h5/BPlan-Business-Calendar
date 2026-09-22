import { runBillingAnnualRenewalReadOnly } from './lifecycle-renewal-command';

void runBillingAnnualRenewalReadOnly().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write(
      'RevenueCat annual natural renewal (read-only)\nResult: FAIL\nFailure: READ_FAILED\n',
    );
    process.exitCode = 1;
  },
);
