import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { BILLING_CONTRACT, REVENUECAT_CLI_APPROVED_VERSION } from './contract';

const MACHINE_FLAGS = ['--json', '--no-input', '--no-color'] as const;
const MAX_OUTPUT_BYTES = 1_000_000;
const CHILD_OS_ENVIRONMENT_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'TMPDIR',
] as const;

export const REVENUECAT_CLI_TIMEOUT_MS = 30_000;

const resourceIdentifierSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('-') && !/\s/.test(value), 'identifier is not safe');

export const REVENUECAT_CLI_MACHINE_FLAGS = MACHINE_FLAGS;

export type RevenueCatJsonValue =
  | null
  | boolean
  | number
  | string
  | RevenueCatJsonValue[]
  | { readonly [key: string]: RevenueCatJsonValue };

const revenueCatJsonValueSchema: z.ZodType<RevenueCatJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(revenueCatJsonValueSchema),
    z.record(revenueCatJsonValueSchema),
  ]),
);

declare const discoveredProjectIdBrand: unique symbol;

/** A project ID branded by the provider project-list reducer. */
export type RevenueCatProjectId = string & {
  readonly [discoveredProjectIdBrand]: 'provider-discovered';
};

export type RevenueCatCliOperation =
  | { readonly kind: 'version' }
  | { readonly kind: 'projects-list' }
  | { readonly kind: 'projects-show'; readonly projectId: RevenueCatProjectId }
  | { readonly kind: 'apps-list'; readonly projectId: RevenueCatProjectId }
  | { readonly kind: 'apps-show'; readonly projectId: RevenueCatProjectId; readonly appId: string }
  | { readonly kind: 'products-list'; readonly projectId: RevenueCatProjectId }
  | {
      readonly kind: 'products-show';
      readonly projectId: RevenueCatProjectId;
      readonly productId: string;
    }
  | {
      readonly kind: 'products-prices';
      readonly projectId: RevenueCatProjectId;
      readonly productId?: string;
    }
  | { readonly kind: 'entitlements-list'; readonly projectId: RevenueCatProjectId }
  | {
      readonly kind: 'entitlements-show';
      readonly projectId: RevenueCatProjectId;
      readonly entitlementId: string;
    }
  | {
      readonly kind: 'entitlements-products';
      readonly projectId: RevenueCatProjectId;
      readonly entitlementId: string;
    }
  | { readonly kind: 'offerings-list'; readonly projectId: RevenueCatProjectId }
  | {
      readonly kind: 'offerings-show';
      readonly projectId: RevenueCatProjectId;
      readonly offeringId: string;
    }
  | {
      readonly kind: 'offerings-verify';
      readonly projectId: RevenueCatProjectId;
      readonly offeringId?: string;
    }
  | {
      readonly kind: 'offerings-packages';
      readonly projectId: RevenueCatProjectId;
      readonly offeringId: string;
    }
  | { readonly kind: 'packages-list'; readonly projectId: RevenueCatProjectId }
  | {
      readonly kind: 'packages-show';
      readonly projectId: RevenueCatProjectId;
      readonly packageId: string;
    }
  | {
      readonly kind: 'packages-products';
      readonly projectId: RevenueCatProjectId;
      readonly packageId: string;
    }
  | {
      readonly kind: 'customers-show';
      readonly projectId: RevenueCatProjectId;
      readonly customerId: string;
    }
  | {
      readonly kind: 'customers-aliases';
      readonly projectId: RevenueCatProjectId;
      readonly customerId: string;
    }
  | {
      readonly kind: 'subscriptions-show';
      readonly projectId: RevenueCatProjectId;
      readonly subscriptionId: string;
    }
  | {
      readonly kind: 'subscriptions-transactions';
      readonly projectId: RevenueCatProjectId;
      readonly subscriptionId: string;
    }
  | {
      readonly kind: 'subscriptions-entitlements';
      readonly projectId: RevenueCatProjectId;
      readonly subscriptionId: string;
    }
  | {
      readonly kind: 'purchases-show';
      readonly projectId: RevenueCatProjectId;
      readonly purchaseId: string;
    }
  | {
      readonly kind: 'purchases-entitlements';
      readonly projectId: RevenueCatProjectId;
      readonly purchaseId: string;
    }
  | { readonly kind: 'webhooks-list'; readonly projectId: RevenueCatProjectId }
  | {
      readonly kind: 'webhooks-show';
      readonly projectId: RevenueCatProjectId;
      readonly webhookId: string;
    };

export type RevenueCatCliOperationKind = RevenueCatCliOperation['kind'];

export type RevenueCatCliErrorCode =
  | 'CLI_API_KEY_MISSING'
  | 'CLI_EXECUTABLE_NOT_FOUND'
  | 'CLI_TIMEOUT'
  | 'CLI_OUTPUT_LIMIT'
  | 'CLI_PROCESS_ERROR'
  | 'CLI_GENERAL_ERROR'
  | 'CLI_BAD_USAGE'
  | 'CLI_AUTHORIZATION'
  | 'CLI_RESOURCE_NOT_FOUND'
  | 'CLI_RATE_LIMITED'
  | 'CLI_UNEXPECTED_EXIT'
  | 'CLI_MALFORMED_JSON'
  | 'CLI_UNSUPPORTED_OPERATION'
  | 'CLI_VERSION_MALFORMED'
  | 'CLI_VERSION_OLDER'
  | 'CLI_VERSION_NEWER'
  | 'RESOURCE_ID_INVALID'
  | 'PROJECT_LIST_MALFORMED'
  | 'PROJECT_PAGINATION_UNSUPPORTED'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_DUPLICATE'
  | 'PROJECT_IDENTITY_CHANGED';

export interface RevenueCatCliErrorInfo {
  readonly code: RevenueCatCliErrorCode;
  readonly message: string;
  readonly exitCode?: number;
  readonly operation?: RevenueCatCliOperationKind;
}

export type RevenueCatCliResult<T> =
  | {
      readonly ok: true;
      readonly operation: RevenueCatCliOperationKind;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: RevenueCatCliErrorInfo;
    };

export interface RevenueCatCliInvocation {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
}

export type RevenueCatCliProcessFailure =
  'executable-not-found' | 'timeout' | 'output-limit' | 'process-error';

export interface RevenueCatCliProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly failure?: RevenueCatCliProcessFailure;
}

export type RevenueCatCliRunner = (
  invocation: RevenueCatCliInvocation,
) => Promise<RevenueCatCliProcessResult>;

export interface RevenueCatExecFileError extends Error {
  readonly code?: number | string;
  readonly killed?: boolean;
}

export interface RevenueCatExecFileOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly maxBuffer: number;
  readonly shell: false;
  readonly timeout: number;
  readonly windowsHide: true;
}

export type RevenueCatExecFile = (
  file: string,
  argv: readonly string[],
  options: RevenueCatExecFileOptions,
  callback: (error: RevenueCatExecFileError | null, stdout: string, stderr: string) => void,
) => void;

export interface RevenueCatCliRealRunnerOptions {
  readonly execFileImpl?: RevenueCatExecFile;
  readonly nodeExecutable?: string;
  readonly resolveLauncher?: () => string | undefined;
}

export interface RevenueCatCliRunOptions {
  readonly apiKey?: string;
  readonly parentEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly runner?: RevenueCatCliRunner;
}

export type RevenueCatCliArgumentResult =
  | { readonly ok: true; readonly argv: readonly string[] }
  | { readonly ok: false; readonly error: RevenueCatCliErrorInfo };

type InternalResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: RevenueCatCliErrorInfo };

function errorResult<T>(code: RevenueCatCliErrorCode, message: string): InternalResult<T> {
  return { ok: false, error: { code, message } };
}

function argumentResult(argv: readonly string[]): RevenueCatCliArgumentResult {
  return { ok: true, argv };
}

function validateIdentifier(value: string, label: string): InternalResult<string> {
  const parsed = resourceIdentifierSchema.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : errorResult('RESOURCE_ID_INVALID', `${label} must be a non-empty provider identifier.`);
}

function validateOptionalIdentifier(
  value: string | undefined,
  label: string,
): InternalResult<string | undefined> {
  return value === undefined ? { ok: true, data: undefined } : validateIdentifier(value, label);
}

function projectScopedArguments(
  command: readonly string[],
  projectId: RevenueCatProjectId,
  positional: readonly string[] = [],
): RevenueCatCliArgumentResult {
  const validatedProjectId = validateIdentifier(projectId, 'projectId');
  if (!validatedProjectId.ok) return validatedProjectId;

  return argumentResult([
    ...command,
    ...positional,
    ...MACHINE_FLAGS,
    '--project-id',
    validatedProjectId.data,
  ]);
}

function projectScopedResourceArguments(
  command: readonly string[],
  projectId: RevenueCatProjectId,
  resource: string,
  resourceLabel: string,
): RevenueCatCliArgumentResult {
  const validatedResource = validateIdentifier(resource, resourceLabel);
  if (!validatedResource.ok) return validatedResource;
  return projectScopedArguments(command, projectId, [validatedResource.data]);
}

/** Builds argv from a closed operation union; it never accepts arbitrary CLI arguments. */
export function buildRevenueCatCliArgv(
  operation: RevenueCatCliOperation,
): RevenueCatCliArgumentResult {
  switch (operation.kind) {
    case 'version':
      return argumentResult(['version', ...MACHINE_FLAGS]);
    case 'projects-list':
      return argumentResult(['projects', 'list', ...MACHINE_FLAGS]);
    case 'projects-show':
      return projectScopedArguments(['projects', 'show'], operation.projectId);
    case 'apps-list':
      return projectScopedArguments(['apps', 'list'], operation.projectId);
    case 'apps-show':
      return projectScopedResourceArguments(
        ['apps', 'show'],
        operation.projectId,
        operation.appId,
        'appId',
      );
    case 'products-list':
      return projectScopedArguments(['products', 'list'], operation.projectId);
    case 'products-show':
      return projectScopedResourceArguments(
        ['products', 'show'],
        operation.projectId,
        operation.productId,
        'productId',
      );
    case 'products-prices': {
      const productId = validateOptionalIdentifier(operation.productId, 'productId');
      if (!productId.ok) return productId;
      return projectScopedArguments(
        ['products', 'prices'],
        operation.projectId,
        productId.data === undefined ? [] : [productId.data],
      );
    }
    case 'entitlements-list':
      return projectScopedArguments(['entitlements', 'list'], operation.projectId);
    case 'entitlements-show':
      return projectScopedResourceArguments(
        ['entitlements', 'show'],
        operation.projectId,
        operation.entitlementId,
        'entitlementId',
      );
    case 'entitlements-products':
      return projectScopedResourceArguments(
        ['entitlements', 'products'],
        operation.projectId,
        operation.entitlementId,
        'entitlementId',
      );
    case 'offerings-list':
      return projectScopedArguments(['offerings', 'list'], operation.projectId);
    case 'offerings-show':
      return projectScopedResourceArguments(
        ['offerings', 'show'],
        operation.projectId,
        operation.offeringId,
        'offeringId',
      );
    case 'offerings-verify': {
      const offeringId = validateOptionalIdentifier(operation.offeringId, 'offeringId');
      if (!offeringId.ok) return offeringId;
      return projectScopedArguments(
        ['offerings', 'verify'],
        operation.projectId,
        offeringId.data === undefined ? [] : [offeringId.data],
      );
    }
    case 'offerings-packages':
      return projectScopedResourceArguments(
        ['offerings', 'packages'],
        operation.projectId,
        operation.offeringId,
        'offeringId',
      );
    case 'packages-list':
      return projectScopedArguments(['packages', 'list'], operation.projectId);
    case 'packages-show':
      return projectScopedResourceArguments(
        ['packages', 'show'],
        operation.projectId,
        operation.packageId,
        'packageId',
      );
    case 'packages-products':
      return projectScopedResourceArguments(
        ['packages', 'products'],
        operation.projectId,
        operation.packageId,
        'packageId',
      );
    case 'customers-show':
      return projectScopedResourceArguments(
        ['customers', 'show'],
        operation.projectId,
        operation.customerId,
        'customerId',
      );
    case 'customers-aliases':
      return projectScopedResourceArguments(
        ['customers', 'aliases'],
        operation.projectId,
        operation.customerId,
        'customerId',
      );
    case 'subscriptions-show':
      return projectScopedResourceArguments(
        ['subscriptions', 'show'],
        operation.projectId,
        operation.subscriptionId,
        'subscriptionId',
      );
    case 'subscriptions-transactions':
      return projectScopedResourceArguments(
        ['subscriptions', 'transactions'],
        operation.projectId,
        operation.subscriptionId,
        'subscriptionId',
      );
    case 'subscriptions-entitlements':
      return projectScopedResourceArguments(
        ['subscriptions', 'entitlements'],
        operation.projectId,
        operation.subscriptionId,
        'subscriptionId',
      );
    case 'purchases-show':
      return projectScopedResourceArguments(
        ['purchases', 'show'],
        operation.projectId,
        operation.purchaseId,
        'purchaseId',
      );
    case 'purchases-entitlements':
      return projectScopedResourceArguments(
        ['purchases', 'entitlements'],
        operation.projectId,
        operation.purchaseId,
        'purchaseId',
      );
    case 'webhooks-list':
      return projectScopedArguments(['webhooks', 'list'], operation.projectId);
    case 'webhooks-show':
      return projectScopedResourceArguments(
        ['webhooks', 'show'],
        operation.projectId,
        operation.webhookId,
        'webhookId',
      );
    default:
      return {
        ok: false,
        error: {
          code: 'CLI_UNSUPPORTED_OPERATION',
          message: 'The requested RevenueCat CLI operation is not allowlisted.',
        },
      };
  }
}

function copyEnvironmentVariableCaseInsensitively(
  target: Record<string, string | undefined>,
  source: Readonly<Record<string, string | undefined>>,
  approvedName: string,
): void {
  const matchedEntry = Object.entries(source).find(
    ([name, value]) => name.toLowerCase() === approvedName.toLowerCase() && value !== undefined,
  );
  if (matchedEntry === undefined) return;

  const [name, value] = matchedEntry;
  target[name] = value;
}

/** Creates a minimal child environment without forwarding ambient application secrets. */
export function buildRevenueCatChildEnvironment(
  apiKey: string | undefined,
  configDirectory: string,
  parentEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string | undefined>> {
  const childEnvironment: Record<string, string | undefined> = {};
  for (const approvedName of CHILD_OS_ENVIRONMENT_ALLOWLIST) {
    copyEnvironmentVariableCaseInsensitively(childEnvironment, parentEnvironment, approvedName);
  }

  childEnvironment.RC_CONFIG_DIR = configDirectory;
  if (apiKey !== undefined) childEnvironment.RC_API_KEY = apiKey;

  return childEnvironment;
}

/** Resolves only the launcher owned by the repository-pinned npm package. */
export function resolveRevenueCatCliLauncher(
  resolvePackage: (request: string) => string = require.resolve,
): string | undefined {
  try {
    return resolvePackage('@revenuecat/cli/bin/rc.js');
  } catch {
    return undefined;
  }
}

export function createRealRevenueCatCliRunner(
  options: RevenueCatCliRealRunnerOptions = {},
): RevenueCatCliRunner {
  return (invocation) =>
    new Promise((resolve) => {
      const launcher = (options.resolveLauncher ?? resolveRevenueCatCliLauncher)();
      if (launcher === undefined) {
        resolve({ exitCode: null, stdout: '', stderr: '', failure: 'executable-not-found' });
        return;
      }

      const execFileImpl: RevenueCatExecFile = options.execFileImpl ?? execFile;
      execFileImpl(
        options.nodeExecutable ?? process.execPath,
        [launcher, ...invocation.argv],
        {
          env: invocation.env,
          maxBuffer: MAX_OUTPUT_BYTES,
          shell: false,
          timeout: REVENUECAT_CLI_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
              resolve({ exitCode: null, stdout: '', stderr: '', failure: 'output-limit' });
              return;
            }

            if (error.killed === true) {
              resolve({ exitCode: null, stdout: '', stderr: '', failure: 'timeout' });
              return;
            }

            if (typeof error.code === 'number') {
              resolve({ exitCode: error.code, stdout, stderr });
              return;
            }

            resolve({
              exitCode: null,
              stdout,
              stderr,
              failure: error.code === 'ENOENT' ? 'executable-not-found' : 'process-error',
            });
            return;
          }

          resolve({ exitCode: 0, stdout, stderr });
        },
      );
    });
}

const realRevenueCatCliRunner = createRealRevenueCatCliRunner();

/** Give each CLI invocation its own empty config directory and remove it afterward. */
async function runWithIsolatedConfig(
  argv: readonly string[],
  apiKey: string | undefined,
  parentEnvironment: Readonly<Record<string, string | undefined>> | undefined,
  runner: RevenueCatCliRunner,
): Promise<RevenueCatCliProcessResult> {
  const configDirectory = mkdtempSync(join(tmpdir(), 'bcalai-revenuecat-'));
  try {
    return await runner({
      argv,
      env: buildRevenueCatChildEnvironment(apiKey, configDirectory, parentEnvironment),
    });
  } finally {
    rmSync(configDirectory, { recursive: true, force: true });
  }
}

/** One explicit sandbox cancellation. Keep mutation outside the read-only operation union. */
export async function cancelRevenueCatSandboxSubscriptionOnce(
  projectId: RevenueCatProjectId,
  subscriptionId: string,
  options: RevenueCatCliRunOptions,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: RevenueCatCliErrorInfo }> {
  const project = validateIdentifier(projectId, 'projectId');
  const subscription = validateIdentifier(subscriptionId, 'subscriptionId');
  if (!project.ok) return project;
  if (!subscription.ok) return subscription;
  if (!options.apiKey?.trim())
    return errorResult('CLI_API_KEY_MISSING', 'A RevenueCat API key is required.');
  let result: RevenueCatCliProcessResult;
  try {
    result = await runWithIsolatedConfig(
      [
        'subscriptions',
        'cancel',
        subscription.data,
        '--yes',
        ...MACHINE_FLAGS,
        '--project-id',
        project.data,
      ],
      options.apiKey,
      options.parentEnvironment,
      options.runner ?? realRevenueCatCliRunner,
    );
  } catch {
    return errorResult('CLI_PROCESS_ERROR', 'RevenueCat CLI process failed.');
  }
  if (result.failure === 'timeout')
    return errorResult('CLI_TIMEOUT', 'RevenueCat cancellation outcome is ambiguous.');
  if (result.failure === 'output-limit')
    return errorResult('CLI_OUTPUT_LIMIT', 'RevenueCat cancellation outcome is ambiguous.');
  if (result.failure)
    return errorResult('CLI_PROCESS_ERROR', 'RevenueCat cancellation outcome is ambiguous.');
  if (result.exitCode === null)
    return errorResult('CLI_UNEXPECTED_EXIT', 'RevenueCat cancellation outcome is ambiguous.');
  if (result.exitCode !== 0) return { ok: false, error: mapExitCode(result.exitCode) };
  return { ok: true };
}

function parseJsonOutput(
  operation: RevenueCatCliOperationKind,
  stdout: string,
): InternalResult<RevenueCatJsonValue> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return errorResult(
      'CLI_MALFORMED_JSON',
      `RevenueCat CLI returned malformed JSON for ${operation}.`,
    );
  }

  const validated = revenueCatJsonValueSchema.safeParse(parsed);
  return validated.success
    ? { ok: true, data: validated.data }
    : errorResult('CLI_MALFORMED_JSON', `RevenueCat CLI returned invalid JSON for ${operation}.`);
}

function withOperation<T>(
  operation: RevenueCatCliOperationKind,
  error: RevenueCatCliErrorInfo,
): RevenueCatCliResult<T> {
  return { ok: false, error: { ...error, operation } };
}

function mapExitCode(
  exitCode: number,
  operation?: RevenueCatCliOperationKind,
): RevenueCatCliErrorInfo {
  let error: RevenueCatCliErrorInfo;
  switch (exitCode) {
    case 1:
      error = {
        code: 'CLI_GENERAL_ERROR',
        message: 'RevenueCat CLI returned a general error.',
        exitCode,
      };
      break;
    case 2:
      error = {
        code: 'CLI_BAD_USAGE',
        message: 'RevenueCat CLI rejected the requested operation.',
        exitCode,
      };
      break;
    case 4:
      error = {
        code: 'CLI_AUTHORIZATION',
        message: 'RevenueCat CLI authentication or authorization failed.',
        exitCode,
      };
      break;
    case 5:
      error = {
        code: 'CLI_RESOURCE_NOT_FOUND',
        message: 'RevenueCat CLI could not find the resource.',
        exitCode,
      };
      break;
    case 6:
      error = {
        code: 'CLI_RATE_LIMITED',
        message: 'RevenueCat CLI reported rate limiting.',
        exitCode,
      };
      break;
    default:
      error = {
        code: 'CLI_UNEXPECTED_EXIT',
        message: `RevenueCat CLI exited with unsupported code ${exitCode}.`,
        exitCode,
      };
      break;
  }
  return operation === undefined ? error : { ...error, operation };
}

/** Executes only the closed read-only operation union through an injected or real runner. */
export async function runRevenueCatCli(
  operation: RevenueCatCliOperation,
  options: RevenueCatCliRunOptions = {},
): Promise<RevenueCatCliResult<RevenueCatJsonValue>> {
  const argumentsResult = buildRevenueCatCliArgv(operation);
  if (!argumentsResult.ok) return withOperation(operation.kind, argumentsResult.error);

  if (operation.kind !== 'version' && !options.apiKey?.trim()) {
    return withOperation(operation.kind, {
      code: 'CLI_API_KEY_MISSING',
      message: 'A RevenueCat API key is required.',
    });
  }

  const runner = options.runner ?? realRevenueCatCliRunner;

  let processResult: RevenueCatCliProcessResult;
  try {
    processResult = await runWithIsolatedConfig(
      argumentsResult.argv,
      options.apiKey,
      options.parentEnvironment,
      runner,
    );
  } catch {
    return withOperation(operation.kind, {
      code: 'CLI_PROCESS_ERROR',
      message: 'RevenueCat CLI process failed.',
    });
  }

  if (processResult.failure === 'executable-not-found') {
    return withOperation(operation.kind, {
      code: 'CLI_EXECUTABLE_NOT_FOUND',
      message: 'RevenueCat CLI executable was not found.',
    });
  }

  if (processResult.failure === 'timeout') {
    return withOperation(operation.kind, {
      code: 'CLI_TIMEOUT',
      message: 'RevenueCat CLI process timed out.',
    });
  }

  if (processResult.failure === 'output-limit') {
    return withOperation(operation.kind, {
      code: 'CLI_OUTPUT_LIMIT',
      message: 'RevenueCat CLI output exceeded the limit.',
    });
  }

  if (processResult.failure === 'process-error') {
    return withOperation(operation.kind, {
      code: 'CLI_PROCESS_ERROR',
      message: 'RevenueCat CLI process failed.',
    });
  }

  if (processResult.exitCode === null) {
    return withOperation(operation.kind, {
      code: 'CLI_UNEXPECTED_EXIT',
      message: 'RevenueCat CLI did not report an exit code.',
    });
  }

  if (processResult.exitCode !== 0) {
    return withOperation(operation.kind, mapExitCode(processResult.exitCode, operation.kind));
  }

  const parsed = parseJsonOutput(operation.kind, processResult.stdout);
  return parsed.ok
    ? { ok: true, operation: operation.kind, data: parsed.data }
    : withOperation(operation.kind, parsed.error);
}

const versionPayloadSchema = z.union([
  z.string(),
  z.object({ version: z.string() }),
  z.object({ data: z.object({ version: z.string() }) }),
]);

export type RevenueCatCliVersionCheckResult =
  | { readonly ok: true; readonly version: typeof REVENUECAT_CLI_APPROVED_VERSION }
  | { readonly ok: false; readonly error: RevenueCatCliErrorInfo };

function compareVersions(left: string, right: string): number | undefined {
  const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
  const leftMatch = versionPattern.exec(left);
  const rightMatch = versionPattern.exec(right);
  if (!leftMatch || !rightMatch) return undefined;

  const leftParts = [Number(leftMatch[1]), Number(leftMatch[2]), Number(leftMatch[3])];
  const rightParts = [Number(rightMatch[1]), Number(rightMatch[2]), Number(rightMatch[3])];
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) return undefined;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function evaluateRevenueCatCliVersion(
  payload: RevenueCatJsonValue,
): RevenueCatCliVersionCheckResult {
  const parsed = versionPayloadSchema.safeParse(payload);
  const version = parsed.success
    ? typeof parsed.data === 'string'
      ? parsed.data
      : 'data' in parsed.data
        ? parsed.data.data.version
        : parsed.data.version
    : undefined;
  const comparison =
    version === undefined ? undefined : compareVersions(version, REVENUECAT_CLI_APPROVED_VERSION);
  if (version === undefined || comparison === undefined) {
    return {
      ok: false,
      error: {
        code: 'CLI_VERSION_MALFORMED',
        message: 'RevenueCat CLI version output was malformed.',
      },
    };
  }

  if (comparison === 0) return { ok: true, version: REVENUECAT_CLI_APPROVED_VERSION };
  if (comparison < 0) {
    return {
      ok: false,
      error: {
        code: 'CLI_VERSION_OLDER',
        message: `RevenueCat CLI version is older than approved ${REVENUECAT_CLI_APPROVED_VERSION}.`,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'CLI_VERSION_NEWER',
      message: `RevenueCat CLI version is newer than approved ${REVENUECAT_CLI_APPROVED_VERSION}.`,
    },
  };
}

export async function checkRevenueCatCliVersion(
  options: RevenueCatCliRunOptions = {},
): Promise<RevenueCatCliVersionCheckResult> {
  const result = await runRevenueCatCli({ kind: 'version' }, options);
  if (!result.ok) return result;
  const versionResult = evaluateRevenueCatCliVersion(result.data);
  return versionResult.ok
    ? versionResult
    : { ok: false, error: { ...versionResult.error, operation: 'version' } };
}

export interface RevenueCatProjectIdentity {
  readonly id: RevenueCatProjectId;
  readonly name: string;
}

export type RevenueCatProjectDiscoveryResult =
  | { readonly ok: true; readonly project: RevenueCatProjectIdentity }
  | { readonly ok: false; readonly error: RevenueCatCliErrorInfo };

const providerProjectIdSchema = resourceIdentifierSchema.transform(
  (value) => value as RevenueCatProjectId,
);

const projectIdentitySchema = z.object({
  id: providerProjectIdSchema,
  name: z.string().min(1),
});

const projectListEnvelopeSchema = z.union([
  z.object({
    data: z.object({
      items: z.array(projectIdentitySchema),
      next_page: z.string().nullable().optional(),
    }),
  }),
  z.object({
    items: z.array(projectIdentitySchema),
    next_page: z.string().nullable().optional(),
  }),
]);

/** Resolves the exact BPlan project without consulting the historical runbook ID. */
export function discoverBPlanProject(
  payload: RevenueCatJsonValue,
): RevenueCatProjectDiscoveryResult {
  const parsed = projectListEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_LIST_MALFORMED',
        message: 'RevenueCat project-list output was malformed.',
      },
    };
  }

  const page = 'data' in parsed.data ? parsed.data.data : parsed.data;
  if (typeof page.next_page === 'string' && page.next_page.length > 0) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_PAGINATION_UNSUPPORTED',
        message:
          'RevenueCat project discovery requires pagination that the approved named command does not expose.',
      },
    };
  }
  const items = page.items;
  const matches = items.filter((project) => project.name === BILLING_CONTRACT.project.name);
  if (matches.length === 0) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `No RevenueCat project exactly named ${BILLING_CONTRACT.project.name} was found.`,
      },
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_DUPLICATE',
        message: `More than one RevenueCat project exactly named ${BILLING_CONTRACT.project.name} was found.`,
      },
    };
  }

  const [project] = matches;
  if (!project) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_LIST_MALFORMED',
        message: 'RevenueCat project-list output was malformed.',
      },
    };
  }

  return { ok: true, project: { id: project.id, name: project.name } };
}

export function assertRevenueCatProjectIdentityStable(
  expected: RevenueCatProjectIdentity,
  observed: RevenueCatProjectIdentity,
): RevenueCatProjectDiscoveryResult {
  const expectedParsed = projectIdentitySchema.safeParse(expected);
  const observedParsed = projectIdentitySchema.safeParse(observed);
  if (!expectedParsed.success || !observedParsed.success) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_LIST_MALFORMED',
        message: 'RevenueCat project identity was malformed.',
      },
    };
  }

  if (
    expectedParsed.data.id !== observedParsed.data.id ||
    expectedParsed.data.name !== observedParsed.data.name
  ) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_IDENTITY_CHANGED',
        message: 'RevenueCat project identity changed during the run.',
      },
    };
  }

  return { ok: true, project: expectedParsed.data };
}
