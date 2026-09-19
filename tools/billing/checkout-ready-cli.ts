import { runCheckoutReadyCommand } from './checkout-ready-command';

try {
  process.exitCode = runCheckoutReadyCommand({
    environment: process.env,
    argv: process.argv.slice(2),
  });
} catch {
  process.stdout.write('RevenueCat sandbox checkout readiness\n\nResult: FAIL\n');
  process.exitCode = 1;
}
