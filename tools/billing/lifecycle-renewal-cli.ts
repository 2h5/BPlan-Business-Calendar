import { parseLifecyclePlan } from './lifecycle';
import { renewalHeader, runBillingRenewalReadOnly } from './lifecycle-renewal-command';

const argv = process.argv.slice(2);

void runBillingRenewalReadOnly(argv).then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.stdout.write(
      `${renewalHeader(parseLifecyclePlan(argv))}\nResult: FAIL\nFailure: READ_FAILED\n`,
    );
    process.exitCode = 1;
  },
);
