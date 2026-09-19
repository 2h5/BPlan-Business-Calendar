import { describe, expect, it, vi } from 'vitest';

import { BILLING_CONTRACT, REVENUECAT_CLI_APPROVED_VERSION } from './contract';
import {
  assertRevenueCatProjectIdentityStable,
  buildRevenueCatChildEnvironment,
  checkRevenueCatCliVersion,
  createRealRevenueCatCliRunner,
  discoverBPlanProject,
  evaluateRevenueCatCliVersion,
  REVENUECAT_CLI_TIMEOUT_MS,
  resolveRevenueCatCliLauncher,
  runRevenueCatCli,
  type RevenueCatCliInvocation,
  type RevenueCatCliProcessResult,
  type RevenueCatCliRunner,
  type RevenueCatJsonValue,
} from './revenuecat-cli';

const API_KEY = 'sk_test_billing_boundary_secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';

const discoveredProject = discoverBPlanProject({
  data: { items: [{ id: 'proj_test_bplan_01', name: BILLING_CONTRACT.project.name }] },
});
if (!discoveredProject.ok) throw new Error('test provider project fixture was malformed');
const PROJECT_ID = discoveredProject.project.id;

function createFakeRunner(
  processResult: RevenueCatCliProcessResult = {
    exitCode: 0,
    stdout: '{}',
    stderr: '',
  },
): { readonly invocations: RevenueCatCliInvocation[]; readonly runner: RevenueCatCliRunner } {
  const invocations: RevenueCatCliInvocation[] = [];
  const runner: RevenueCatCliRunner = async (invocation) => {
    invocations.push(invocation);
    return processResult;
  };
  return { invocations, runner };
}

function jsonOutput(value: RevenueCatJsonValue): RevenueCatCliProcessResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify(value),
    stderr: '',
  };
}

async function checkVersionPayload(
  payload: RevenueCatJsonValue,
): Promise<Awaited<ReturnType<typeof checkRevenueCatCliVersion>>> {
  const fake = createFakeRunner(jsonOutput(payload));
  return checkRevenueCatCliVersion({ runner: fake.runner });
}

describe('RevenueCat CLI boundary', () => {
  it('accepts only the exact approved CLI version', async () => {
    const fake = createFakeRunner(
      jsonOutput({
        data: { version: REVENUECAT_CLI_APPROVED_VERSION },
        schema_version: 1,
      }),
    );
    const result = await checkRevenueCatCliVersion({ runner: fake.runner });

    expect(result).toEqual({ ok: true, version: '0.1.1' });
    expect(fake.invocations[0]?.argv).toEqual(['version', '--json', '--no-input', '--no-color']);
  });

  it('rejects older, newer, and malformed CLI versions', async () => {
    const older = await checkVersionPayload({ version: '0.1.0' });
    const newer = await checkVersionPayload({ version: '0.1.2' });
    const malformed = await checkVersionPayload({ version: 'not-a-version' });

    expect(older).toMatchObject({ ok: false, error: { code: 'CLI_VERSION_OLDER' } });
    expect(newer).toMatchObject({ ok: false, error: { code: 'CLI_VERSION_NEWER' } });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'CLI_VERSION_MALFORMED' } });
    expect(evaluateRevenueCatCliVersion('0.1')).toMatchObject({
      ok: false,
      error: { code: 'CLI_VERSION_MALFORMED' },
    });
  });

  it('maps a missing CLI executable without exposing process diagnostics', async () => {
    const fake = createFakeRunner({
      exitCode: null,
      stdout: '',
      stderr: 'ENOENT sk_test_billing_boundary_secret',
      failure: 'executable-not-found',
    });

    const result = await runRevenueCatCli({ kind: 'version' }, { runner: fake.runner });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'CLI_EXECUTABLE_NOT_FOUND',
        message: 'RevenueCat CLI executable was not found.',
      },
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('resolves the launcher from the pinned local RevenueCat package', () => {
    const requests: string[] = [];
    const launcher = resolveRevenueCatCliLauncher((request) => {
      requests.push(request);
      return 'Z:\\repo\\node_modules\\@revenuecat\\cli\\bin\\rc.js';
    });

    expect(requests).toEqual(['@revenuecat/cli/bin/rc.js']);
    expect(launcher).toBe('Z:\\repo\\node_modules\\@revenuecat\\cli\\bin\\rc.js');
    expect(
      resolveRevenueCatCliLauncher(() => {
        throw new Error('not installed');
      }),
    ).toBeUndefined();
  });

  it('runs the pinned launcher through Node without a shell or Windows command shim', async () => {
    const launcher = 'Z:\\repo\\node_modules\\@revenuecat\\cli\\bin\\rc.js';
    const nodeExecutable = 'C:\\Program Files\\nodejs\\node.exe';
    let executable = '';
    let physicalArgv: readonly string[] = [];
    let shell: boolean | undefined;
    let childEnvironment: Readonly<Record<string, string | undefined>> | undefined;
    const runner = createRealRevenueCatCliRunner({
      nodeExecutable,
      resolveLauncher: () => launcher,
      execFileImpl: (file, argv, options, callback) => {
        executable = file;
        physicalArgv = argv;
        shell = options.shell;
        childEnvironment = options.env;
        callback(null, '{"data":{"version":"0.1.1"},"schema_version":1}', '');
      },
    });

    const result = await runRevenueCatCli(
      { kind: 'projects-list' },
      {
        apiKey: API_KEY,
        runner,
        parentEnvironment: {
          Path: 'C:\\Windows\\System32',
          OPENAI_API_KEY: 'must-not-reach-child',
          RC_PROJECT_ID: 'must-not-reach-child',
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(executable).toBe(nodeExecutable);
    expect(executable).not.toBe('rc');
    expect(executable).not.toMatch(/\.cmd$/i);
    expect(physicalArgv).toEqual([
      launcher,
      'projects',
      'list',
      '--json',
      '--no-input',
      '--no-color',
    ]);
    expect(physicalArgv).not.toContain(API_KEY);
    expect(shell).toBe(false);
    expect(childEnvironment).toEqual({ Path: 'C:\\Windows\\System32', RC_API_KEY: API_KEY });
  });

  it('maps an unresolved pinned launcher to CLI_EXECUTABLE_NOT_FOUND', async () => {
    const execFileImpl = vi.fn(() => undefined);
    const runner = createRealRevenueCatCliRunner({
      resolveLauncher: () => undefined,
      execFileImpl,
    });

    const result = await runRevenueCatCli({ kind: 'projects-list' }, { apiKey: API_KEY, runner });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CLI_EXECUTABLE_NOT_FOUND' },
    });
    expect(execFileImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('discovers exactly one BPlan project and returns the provider ID', () => {
    const result = discoverBPlanProject({
      data: {
        items: [
          { id: 'proj_other', name: 'Other Project' },
          { id: PROJECT_ID, name: BILLING_CONTRACT.project.name },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      project: { id: PROJECT_ID, name: BILLING_CONTRACT.project.name },
    });
    if (result.ok) {
      expect(result.project.id).not.toBe(BILLING_CONTRACT.project.documentedRunbookId);
    }
  });

  it('fails project discovery for no match, duplicate match, or malformed output', () => {
    const noMatch = discoverBPlanProject({
      data: { items: [{ id: 'proj_other', name: 'Other Project' }] },
    });
    const duplicate = discoverBPlanProject({
      data: {
        items: [
          { id: 'proj_test_one', name: BILLING_CONTRACT.project.name },
          { id: 'proj_test_two', name: BILLING_CONTRACT.project.name },
        ],
      },
    });
    const malformed = discoverBPlanProject({
      data: { items: [{ name: BILLING_CONTRACT.project.name }] },
    });
    const nonExactName = discoverBPlanProject({
      data: { items: [{ id: 'proj_whitespace_name', name: ` ${BILLING_CONTRACT.project.name}` }] },
    });
    const paginated = discoverBPlanProject({
      data: { items: [], next_page: '/projects?cursor=x' },
    });

    expect(noMatch).toMatchObject({ ok: false, error: { code: 'PROJECT_NOT_FOUND' } });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'PROJECT_DUPLICATE' } });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'PROJECT_LIST_MALFORMED' } });
    expect(nonExactName).toMatchObject({ ok: false, error: { code: 'PROJECT_NOT_FOUND' } });
    expect(paginated).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_PAGINATION_UNSUPPORTED' },
    });
  });

  it('fails if project identity changes during a run', () => {
    const stable = assertRevenueCatProjectIdentityStable(
      { id: PROJECT_ID, name: BILLING_CONTRACT.project.name },
      { id: PROJECT_ID, name: BILLING_CONTRACT.project.name },
    );
    const changed = assertRevenueCatProjectIdentityStable(
      { id: PROJECT_ID, name: BILLING_CONTRACT.project.name },
      {
        id: (() => {
          const result = discoverBPlanProject({
            data: {
              items: [{ id: 'proj_changed', name: BILLING_CONTRACT.project.name }],
            },
          });
          if (!result.ok) throw new Error('changed provider project fixture was malformed');
          return result.project.id;
        })(),
        name: BILLING_CONTRACT.project.name,
      },
    );

    expect(stable).toMatchObject({ ok: true, project: { id: PROJECT_ID } });
    expect(changed).toMatchObject({ ok: false, error: { code: 'PROJECT_IDENTITY_CHANGED' } });
  });

  it('uses machine flags, explicit project scope, and a minimal child environment', async () => {
    const fake = createFakeRunner();
    const result = await runRevenueCatCli(
      { kind: 'customers-show', projectId: PROJECT_ID, customerId: USER_ID },
      {
        apiKey: API_KEY,
        runner: fake.runner,
        parentEnvironment: {
          PATH: 'test-path',
          PATHEXT: '.EXE;.CMD',
          SystemRoot: 'C:\\Windows',
          WINDIR: 'C:\\Windows',
          TEMP: 'C:\\Temp',
          TMP: 'C:\\Tmp',
          TMPDIR: '/tmp/revenuecat',
          HOME: '/home/test-user',
          USERPROFILE: 'C:\\Users\\test-user',
          HTTP_PROXY: 'http://proxy-user:proxy-secret@example.test',
          HTTPS_PROXY: 'https://proxy-user:proxy-secret@example.test',
          NO_PROXY: 'internal.example.test',
          RC_API_KEY: 'ambient-secret',
          REVENUECAT_API_KEY: 'ambient-revenuecat-secret',
          RC_PROJECT_ID: 'ambient-project',
          RC_PROFILE: 'ambient-profile',
          RC_HEADERS: 'Authorization: Bearer ambient-secret',
          RC_API_URL: 'https://unexpected.example.test',
          BILLING_SUPABASE_SERVICE_ROLE_KEY: 'billing-service-role-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
          STRIPE_SECRET_KEY: 'stripe-secret',
          REVENUECAT_WEBHOOK_SECRET: 'webhook-secret',
          OPENAI_API_KEY: 'openai-secret',
          GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-secret',
          MICROSOFT_OAUTH_CLIENT_SECRET: 'microsoft-oauth-secret',
          GITHUB_TOKEN: 'github-token',
          UNEXPECTED_PARENT_VALUE: 'must-not-be-forwarded',
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(fake.invocations).toHaveLength(1);
    const invocation = fake.invocations[0];
    expect(invocation).toBeDefined();
    if (!invocation) throw new Error('fake runner invocation was not captured');

    expect(invocation.argv).toEqual([
      'customers',
      'show',
      USER_ID,
      '--json',
      '--no-input',
      '--no-color',
      '--project-id',
      PROJECT_ID,
    ]);
    expect(invocation.argv).not.toContain(API_KEY);
    expect(invocation.argv).not.toContain('--yes');
    expect(invocation.env.RC_API_KEY).toBe(API_KEY);
    expect(invocation.env.RC_PROJECT_ID).toBeUndefined();
    expect(invocation.env.RC_PROFILE).toBeUndefined();
    expect(invocation.env.REVENUECAT_API_KEY).toBeUndefined();
    expect(invocation.env).toEqual({
      PATH: 'test-path',
      PATHEXT: '.EXE;.CMD',
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Tmp',
      TMPDIR: '/tmp/revenuecat',
      RC_API_KEY: API_KEY,
    });
  });

  it('does not use ambient project selection for project discovery', async () => {
    const fake = createFakeRunner(
      jsonOutput({ data: { items: [{ id: PROJECT_ID, name: BILLING_CONTRACT.project.name }] } }),
    );
    const result = await runRevenueCatCli(
      { kind: 'projects-list' },
      {
        apiKey: API_KEY,
        runner: fake.runner,
        parentEnvironment: { RC_PROJECT_ID: 'ambient-project', RC_PROFILE: 'ambient-profile' },
      },
    );

    expect(result.ok).toBe(true);
    const invocation = fake.invocations[0];
    expect(invocation).toBeDefined();
    if (!invocation) throw new Error('fake runner invocation was not captured');
    expect(invocation.argv).toEqual(['projects', 'list', '--json', '--no-input', '--no-color']);
    expect(invocation.argv).not.toContain('--project-id');
    expect(invocation.env.RC_PROJECT_ID).toBeUndefined();
    expect(invocation.env.RC_PROFILE).toBeUndefined();
  });

  it('copies PATH case-insensitively without copying similarly named variables', () => {
    const uppercasePath = buildRevenueCatChildEnvironment(undefined, {
      PATH: 'uppercase-path',
      PATH_SECRET: 'must-not-be-forwarded',
    });
    const titleCasePath = buildRevenueCatChildEnvironment(undefined, {
      Path: 'title-case-path',
      PathToken: 'must-not-be-forwarded',
    });

    expect(uppercasePath).toEqual({ PATH: 'uppercase-path' });
    expect(titleCasePath).toEqual({ Path: 'title-case-path' });
  });

  it('uses the fixed read-only subprocess timeout', () => {
    expect(REVENUECAT_CLI_TIMEOUT_MS).toBe(30_000);
  });

  it('maps timeout and output-limit failures without leaking provider output', async () => {
    const failureCases = [
      ['timeout', 'CLI_TIMEOUT'],
      ['output-limit', 'CLI_OUTPUT_LIMIT'],
    ] as const;

    for (const [failure, errorCode] of failureCases) {
      const fake = createFakeRunner({
        exitCode: null,
        stdout: `oversized provider output ${API_KEY}`,
        stderr: `provider diagnostics ${API_KEY}`,
        failure,
      });
      const result = await runRevenueCatCli(
        { kind: 'projects-list' },
        { apiKey: API_KEY, runner: fake.runner },
      );

      expect(result).toMatchObject({ ok: false, error: { code: errorCode } });
      expect(JSON.stringify(result)).not.toContain(API_KEY);
      expect(JSON.stringify(result)).not.toContain('provider');
    }
  });

  it('cannot request a forbidden operation through the runtime boundary', async () => {
    const fake = createFakeRunner();
    const forbiddenOperation = { kind: 'customers-grant' } as never;
    const result = await runRevenueCatCli(forbiddenOperation, {
      apiKey: API_KEY,
      runner: fake.runner,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'CLI_UNSUPPORTED_OPERATION' } });
    expect(fake.invocations).toHaveLength(0);
  });

  it('maps documented and unexpected exit codes without raw output', async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [1, 'CLI_GENERAL_ERROR'],
      [2, 'CLI_BAD_USAGE'],
      [4, 'CLI_AUTHORIZATION'],
      [5, 'CLI_RESOURCE_NOT_FOUND'],
      [6, 'CLI_RATE_LIMITED'],
      [7, 'CLI_UNEXPECTED_EXIT'],
    ];

    for (const [exitCode, errorCode] of cases) {
      const fake = createFakeRunner({
        exitCode,
        stdout: `{"secret":"${API_KEY}"}`,
        stderr: `provider payload ${API_KEY}`,
      });
      const result = await runRevenueCatCli(
        { kind: 'projects-list' },
        { apiKey: API_KEY, runner: fake.runner },
      );

      expect(result).toMatchObject({ ok: false, error: { code: errorCode } });
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    }
  });

  it('fails closed for malformed JSON and performs no network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeRunner({ exitCode: 0, stdout: '{not-json', stderr: '' });

    const result = await runRevenueCatCli(
      { kind: 'projects-list' },
      { apiKey: API_KEY, runner: fake.runner },
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'CLI_MALFORMED_JSON' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.invocations).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
