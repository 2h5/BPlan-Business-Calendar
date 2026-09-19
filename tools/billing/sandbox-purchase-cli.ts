import { runSandboxPurchaseCommand } from './sandbox-purchase-command';

void runSandboxPurchaseCommand().then((exitCode) => {
  process.exitCode = exitCode;
});
