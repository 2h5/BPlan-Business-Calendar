import { runBillingPreflightCommand } from './command';

const exitCode = runBillingPreflightCommand(process.env);
process.exitCode = exitCode;
