import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@^1.0.0';
import type { SchedulingIntent } from '@cal/schemas/scheduling';

import { EdgeError, type EdgeErrorCode } from '../errors/index.ts';
import {
  createOpenAiIntentProvider,
  openAiIntentConfigFromEnv,
  type OpenAiIntentConfig,
} from './openai-intent.ts';
import type { AiIntentInput } from './intent.ts';

const CONFIG: OpenAiIntentConfig = {
  apiKey: 'intent-secret-key',
  model: 'gpt-5.6-luna',
  reasoningEffort: 'low',
  timeoutMs: 20_000,
};

const INPUT: AiIntentInput = {
  rawText: 'meeting with Andrew lasting 15m',
  timezone: 'America/New_York',
  currentLocalDate: '2026-09-08',
  currentLocalTime: '10:00',
};

const VALID_INTENT: SchedulingIntent = {
  title: 'meeting with Andrew',
  duration: { type: 'exact', minutes: 15 },
  date: { type: 'unconstrained' },
  time: { type: 'unconstrained' },
  location: null,
  description: null,
  requiresClarification: false,
  clarificationQuestion: null,
};

Deno.test(
  'sends a private tool-free strict Responses API request for intent and captures metadata',
  async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    let now = 1_000;
    const provider = createOpenAiIntentProvider(CONFIG, {
      fetch: (url, init) => {
        calls.push({ url, init });
        now += 42;
        return Promise.resolve(openAiResponse(VALID_INTENT));
      },
      now: () => now,
    });

    const result = await provider.parseSchedulingIntent(INPUT);

    assertEquals(result.intent, VALID_INTENT);
    assertEquals(result.metadata, {
      provider: 'openai',
      model: 'gpt-5.6-luna',
      responseId: 'resp_intent_test',
      promptVersion: 'find-time-intent-v1',
      latencyMs: 42,
      usage: { inputTokens: 90, outputTokens: 30, reasoningTokens: 5, totalTokens: 125 },
    });

    const call = calls[0];
    assertEquals(String(call?.url), 'https://api.openai.com/v1/responses');
    assertEquals(
      (call?.init?.headers as Record<string, string>).Authorization,
      'Bearer intent-secret-key',
    );
    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
    assertEquals(body.model, 'gpt-5.6-luna');
    assertEquals(body.store, false);
    assertEquals(body.reasoning, { effort: 'low' });
    assertEquals(body.tools, []);
    assertEquals(body.parallel_tool_calls, false);
    assertEquals((body.text as { format: Record<string, unknown> }).format.type, 'json_schema');
    assertEquals(
      (body.text as { format: Record<string, unknown> }).format.name,
      'ai_scheduling_intent',
    );
    assertEquals((body.text as { format: Record<string, unknown> }).format.strict, true);
  },
);

Deno.test('rejects a refusal response with AI_INVALID_OUTPUT', async () => {
  const provider = createOpenAiIntentProvider(CONFIG, {
    fetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'resp_refusal',
            model: 'gpt-5.6-luna',
            status: 'completed',
            output: [{ type: 'refusal', refusal: 'I cannot process this request.' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
  });

  const error = await assertRejects(() => provider.parseSchedulingIntent(INPUT), EdgeError);
  assertEquals(error.code, 'AI_INVALID_OUTPUT');
  assertEquals(error.status, 502);
});

Deno.test('rejects invalid schema output from model with AI_INVALID_OUTPUT', async () => {
  const provider = createOpenAiIntentProvider(CONFIG, {
    fetch: () =>
      Promise.resolve(
        openAiResponse({
          title: '', // violates min(1)
          duration: null,
          date: { type: 'unconstrained' },
          time: { type: 'unconstrained' },
          location: null,
          description: null,
          requiresClarification: false,
          clarificationQuestion: null,
        }),
      ),
  });

  const error = await assertRejects(() => provider.parseSchedulingIntent(INPUT), EdgeError);
  assertEquals(error.code, 'AI_INVALID_OUTPUT');
  assertEquals(error.status, 502);
});

Deno.test('retries transient 5xx errors then succeeds', async () => {
  let attempt = 0;
  const sleeps: number[] = [];
  const provider = createOpenAiIntentProvider(CONFIG, {
    fetch: () => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.resolve(new Response('server error', { status: 503 }));
      }
      return Promise.resolve(openAiResponse(VALID_INTENT));
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });

  const result = await provider.parseSchedulingIntent(INPUT);
  assertEquals(result.intent.title, 'meeting with Andrew');
  assertEquals(attempt, 2);
  assertEquals(sleeps.length, 1);
});

Deno.test('throws AI_PROVIDER_UNAVAILABLE when request times out', async () => {
  let now = 1_000;
  const provider = createOpenAiIntentProvider(
    { ...CONFIG, timeoutMs: 100 },
    {
      fetch: () => {
        now += 200; // Exceeds 100ms timeout
        return Promise.reject(new DOMException('The signal has been aborted', 'AbortError'));
      },
      now: () => now,
    },
  );

  const error = await assertRejects(() => provider.parseSchedulingIntent(INPUT), EdgeError);
  assertEquals(error.code, 'AI_PROVIDER_UNAVAILABLE');
  assertEquals(error.status, 503);
});

Deno.test('openAiIntentConfigFromEnv reads environment variables with defaults', () => {
  const originalKey = Deno.env.get('OPENAI_API_KEY');
  const originalModel = Deno.env.get('AI_INTENT_MODEL');
  const originalEffort = Deno.env.get('AI_INTENT_REASONING_EFFORT');

  try {
    Deno.env.set('OPENAI_API_KEY', 'test-env-key');
    Deno.env.delete('AI_INTENT_MODEL');
    Deno.env.delete('AI_INTENT_REASONING_EFFORT');

    const config = openAiIntentConfigFromEnv();
    assertEquals(config.apiKey, 'test-env-key');
    assertEquals(config.model, 'gpt-5.6-luna');
    assertEquals(config.reasoningEffort, 'low');
    assertEquals(config.timeoutMs, 20_000);

    Deno.env.set('AI_INTENT_MODEL', 'gpt-5.6-terra');
    Deno.env.set('AI_INTENT_REASONING_EFFORT', 'medium');
    const customConfig = openAiIntentConfigFromEnv();
    assertEquals(customConfig.model, 'gpt-5.6-terra');
    assertEquals(customConfig.reasoningEffort, 'medium');
  } finally {
    if (originalKey !== undefined) Deno.env.set('OPENAI_API_KEY', originalKey);
    else Deno.env.delete('OPENAI_API_KEY');
    if (originalModel !== undefined) Deno.env.set('AI_INTENT_MODEL', originalModel);
    else Deno.env.delete('AI_INTENT_MODEL');
    if (originalEffort !== undefined) Deno.env.set('AI_INTENT_REASONING_EFFORT', originalEffort);
    else Deno.env.delete('AI_INTENT_REASONING_EFFORT');
  }
});

function openAiResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      id: 'resp_intent_test',
      model: 'gpt-5.6-luna',
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify(payload),
            },
          ],
        },
      ],
      usage: {
        input_tokens: 90,
        output_tokens: 30,
        output_tokens_details: { reasoning_tokens: 5 },
        total_tokens: 125,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
