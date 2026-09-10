import { z } from 'zod';

import { EdgeError } from '../errors/index.ts';
import {
  AI_INTENT_JSON_SCHEMA,
  AI_INTENT_PROMPT_VERSION,
  INTENT_INSTRUCTIONS,
  validateAiSchedulingIntent,
  type AiIntentInput,
  type AiIntentProvider,
  type AiIntentResult,
} from './intent.ts';
import type { OpenAiReasoningEffort } from './openai.ts';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

const reasoningEffortSchema = z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

export interface OpenAiIntentConfig {
  apiKey: string;
  model: string;
  reasoningEffort: OpenAiReasoningEffort;
  timeoutMs: number;
}

export interface OpenAiIntentDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const responseUsageSchema = z
  .object({
    input_tokens: z.number().int().min(0).nullable().optional(),
    output_tokens: z.number().int().min(0).nullable().optional(),
    total_tokens: z.number().int().min(0).nullable().optional(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().int().min(0).nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const openAiResponseSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    status: z.enum(['completed', 'failed', 'in_progress', 'cancelled', 'queued', 'incomplete']),
    output: z.array(z.unknown()),
    usage: responseUsageSchema.nullable().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    type: z.literal('message'),
    content: z.array(z.unknown()),
  })
  .passthrough();

const outputTextSchema = z
  .object({
    type: z.literal('output_text'),
    text: z.string(),
  })
  .passthrough();

const refusalSchema = z.object({ type: z.literal('refusal') }).passthrough();

export function createOpenAiIntentProvider(
  config: OpenAiIntentConfig,
  deps: OpenAiIntentDeps = {},
): AiIntentProvider {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;

  return {
    provider: 'openai',
    model: config.model,
    parseSchedulingIntent: async (input: AiIntentInput) => {
      const startedAt = now();
      const deadline = startedAt + config.timeoutMs;
      const response = await sendWithRetry(config, input, { fetcher, now, sleep, deadline });
      const body = await readResponse(response);
      const rawJson = parseOutputJson(body);
      const intent = validateAiSchedulingIntent(rawJson);

      return {
        intent,
        metadata: {
          provider: 'openai',
          model: body.model,
          responseId: body.id,
          promptVersion: AI_INTENT_PROMPT_VERSION,
          latencyMs: Math.max(0, now() - startedAt),
          usage: {
            inputTokens: body.usage?.input_tokens ?? null,
            outputTokens: body.usage?.output_tokens ?? null,
            reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens ?? null,
            totalTokens: body.usage?.total_tokens ?? null,
          },
        },
      } satisfies AiIntentResult;
    },
  };
}

export function openAiIntentConfigFromEnv(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): OpenAiIntentConfig {
  const provider = (getEnv('AI_PROVIDER') ?? 'openai').trim();
  if (provider !== 'openai') {
    throw new EdgeError(
      'AI_PROVIDER_UNAVAILABLE',
      'The configured AI provider is unsupported.',
      503,
    );
  }

  const rawApiKey = getEnv('OPENAI_API_KEY');
  const apiKey = rawApiKey?.trim();
  if (!apiKey)
    throw new EdgeError('AI_PROVIDER_UNAVAILABLE', 'AI intent parsing is not configured.', 503);

  // Intent parsing uses its own configurable model and reasoning effort,
  // falling back to existing AI settings and defaulting to Luna Low.
  const model = (getEnv('AI_INTENT_MODEL') ?? getEnv('AI_MODEL') ?? 'gpt-5.6-luna').trim();
  const reasoningEffortRaw = (
    getEnv('AI_INTENT_REASONING_EFFORT') ??
    getEnv('AI_REASONING_EFFORT') ??
    'low'
  ).trim();
  const reasoningEffort = reasoningEffortSchema.safeParse(reasoningEffortRaw);

  const timeoutMsRaw = (
    getEnv('AI_INTENT_TIMEOUT_MS') ??
    getEnv('AI_TIMEOUT_MS') ??
    String(DEFAULT_TIMEOUT_MS)
  ).trim();
  const timeoutMs = parseInteger(timeoutMsRaw);

  if (
    !reasoningEffort.success ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 60_000 ||
    model.length === 0
  ) {
    throw new EdgeError('AI_PROVIDER_UNAVAILABLE', 'AI intent configuration is invalid.', 503);
  }

  return { apiKey, model, reasoningEffort: reasoningEffort.data, timeoutMs };
}

interface RequestDeps {
  fetcher: typeof fetch;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  deadline: number;
}

async function sendWithRetry(
  config: OpenAiIntentConfig,
  input: AiIntentInput,
  deps: RequestDeps,
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = deps.deadline - deps.now();
    if (remaining <= 0) throw providerUnavailable();

    let response: Response;
    try {
      response = await deps.fetcher(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody(config, input)),
        signal: AbortSignal.timeout(Math.max(1, remaining)),
      });
    } catch {
      if (attempt === MAX_ATTEMPTS || deps.now() >= deps.deadline) throw providerUnavailable();
      await sleepWithinDeadline(deps, RETRY_DELAY_MS);
      continue;
    }

    if (response.ok) return response;
    if (!isRetryable(response.status) || attempt === MAX_ATTEMPTS) throw providerUnavailable();

    await sleepWithinDeadline(deps, retryDelay(response));
  }

  throw providerUnavailable();
}

function requestBody(config: OpenAiIntentConfig, input: AiIntentInput): unknown {
  return {
    model: config.model,
    store: false,
    reasoning: { effort: config.reasoningEffort },
    instructions: INTENT_INSTRUCTIONS,
    input: JSON.stringify({
      rawText: input.rawText,
      timezone: input.timezone,
      currentLocalDate: input.currentLocalDate,
      currentLocalTime: input.currentLocalTime,
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'ai_scheduling_intent',
        strict: true,
        schema: AI_INTENT_JSON_SCHEMA,
      },
      verbosity: 'low',
    },
    tools: [],
    parallel_tool_calls: false,
    max_output_tokens: 1_200,
  };
}

async function readResponse(response: Response): Promise<z.infer<typeof openAiResponseSchema>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw invalidOutput();
  }

  const parsed = openAiResponseSchema.safeParse(value);
  if (!parsed.success) throw invalidOutput();
  if (parsed.data.status !== 'completed') throw providerUnavailable();
  return parsed.data;
}

function parseOutputJson(response: z.infer<typeof openAiResponseSchema>): unknown {
  let outputText: string | null = null;

  for (const item of response.output) {
    const message = messageSchema.safeParse(item);
    if (!message.success) continue;

    for (const content of message.data.content) {
      if (refusalSchema.safeParse(content).success) throw providerUnavailable();
      const parsedText = outputTextSchema.safeParse(content);
      if (parsedText.success) {
        if (outputText !== null) throw invalidOutput();
        outputText = parsedText.data.text;
      }
    }
  }

  if (outputText === null) throw invalidOutput();
  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw invalidOutput();
  }
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(response: Response): number {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter || !/^\d+$/.test(retryAfter.trim())) return RETRY_DELAY_MS;
  return Math.min(Number(retryAfter) * 1_000, 2_000);
}

async function sleepWithinDeadline(deps: RequestDeps, requestedMs: number): Promise<void> {
  const remaining = deps.deadline - deps.now();
  if (remaining <= 1) throw providerUnavailable();
  await deps.sleep(Math.min(requestedMs, remaining - 1));
}

function parseInteger(value: string): number {
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

function invalidOutput(): EdgeError {
  return new EdgeError('AI_INVALID_OUTPUT', 'The AI returned an invalid scheduling intent.', 502);
}

function providerUnavailable(): EdgeError {
  return new EdgeError(
    'AI_PROVIDER_UNAVAILABLE',
    'AI scheduling intent service is temporarily unavailable.',
    503,
  );
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
