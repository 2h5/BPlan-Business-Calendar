import { runBillingAssertUserCommand } from './assert-user-command';

void runBillingAssertUserCommand({ environment: process.env, argv: process.argv.slice(2) }).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  () => {
    process.stdout.write('RevenueCat billing user assertion\n\nResult: FAIL\n');
    process.exitCode = 1;
  },
);
