import { parseLifecyclePlan } from './lifecycle';
import { formatLifecycleUnexpectedFailure, runBillingLifecycleReadOnly } from './lifecycle-command';

const argv = process.argv.slice(2);

void runBillingLifecycleReadOnly(argv).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write(`${formatLifecycleUnexpectedFailure(parseLifecyclePlan(argv))}\n`);
    process.exitCode = 1;
  },
);
