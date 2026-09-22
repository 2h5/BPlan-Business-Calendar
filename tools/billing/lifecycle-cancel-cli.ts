import { runSandboxCancellation } from './lifecycle-cancel';

runSandboxCancellation()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    process.stdout.write('RevenueCat sandbox cancellation\nResult: FAIL\nFailure: UNEXPECTED\n');
    process.exitCode = 1;
  });
