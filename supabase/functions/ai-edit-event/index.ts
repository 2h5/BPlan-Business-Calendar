import { aiEventEditRequestSchema } from '@cal/schemas/scheduling';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { generateAiEventEditProposal } from '../_shared/ai/event-edit.ts';
import { createOpenAiEventEditIntentProvider } from '../_shared/ai/event-edit-intent.ts';
import { supabaseEventEditDataSource } from '../_shared/ai/event-edit-repository.ts';
import { openAiIntentConfigFromEnv } from '../_shared/ai/openai-intent.ts';
import { supabaseAiScheduleRepository } from '../_shared/ai/proposal-repository.ts';
import { requireProEntitlement } from '../_shared/billing/entitlement.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';

/**
 * Proposes moving an existing event from a sentence in the AI bar. Read-only:
 * the client confirms an option and saves it through the event mutation path,
 * so provider-owned events are still written to the provider first.
 */
const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') {
    throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);
  }

  const user = await requireUser(request);
  const parsed = aiEventEditRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new EdgeError('VALIDATION_FAILED', 'Bad edit request.', 400);
  }

  const admin = adminClient();
  await requireProEntitlement(admin, user.id, 'Editing events with AI requires Pro.');

  return jsonResponse(
    await generateAiEventEditProposal(
      { userId: user.id, text: parsed.data.text },
      {
        dataSource: supabaseEventEditDataSource(admin),
        repository: supabaseAiScheduleRepository(admin),
        // Lazy, so a rate-limited request never reads provider configuration.
        createIntentProvider: () =>
          createOpenAiEventEditIntentProvider(openAiIntentConfigFromEnv()),
      },
    ),
  );
});

Deno.serve(handler);
