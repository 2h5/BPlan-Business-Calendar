import { formatLifecycleUnexpectedFailure, runBillingLifecycleReadOnly } from './lifecycle-command';

void runBillingLifecycleReadOnly().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write(`${formatLifecycleUnexpectedFailure()}\n`);
    process.exitCode = 1;
  },
);
