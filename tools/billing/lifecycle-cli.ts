import { runBillingLifecycleReadOnly } from './lifecycle-command';

void runBillingLifecycleReadOnly().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write('RevenueCat annual lifecycle (read-only)\nResult: FAIL\n');
    process.exitCode = 1;
  },
);
