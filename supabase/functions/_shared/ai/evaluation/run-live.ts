import { createOpenAiRankingProvider, openAiRankingConfigFromEnv } from '../openai.ts';
import {
  AI_EVALUATION_LUNA_VARIANTS,
  AI_EVALUATION_PRICE_SNAPSHOT,
  findEvaluationVariant,
  runAiRankingEvaluation,
} from './harness.ts';

if (import.meta.main) {
  if (Deno.env.get('RUN_LIVE_AI_EVAL') !== 'true') {
    throw new Error('Set RUN_LIVE_AI_EVAL=true to acknowledge live API usage and cost.');
  }

  const baseConfig = openAiRankingConfigFromEnv();

  // Evaluates Luna Low (default) vs Luna Medium. The model family is fixed, so
  // AI_MODEL and AI_REASONING_EFFORT are deliberately overridden per variant.
  const result = await runAiRankingEvaluation({
    models: AI_EVALUATION_LUNA_VARIANTS.map((variant) => variant.label),
    repetitions: 5,
    createProvider: (label) => {
      const variant = findEvaluationVariant(label);
      return createOpenAiRankingProvider({
        ...baseConfig,
        model: variant.model,
        reasoningEffort: variant.reasoningEffort,
      });
    },
  });

  // Deliberately emit aggregate metrics and failure classes only. Prompts,
  // task text, notes, candidate timestamps, and provider bodies are excluded.
  console.log(
    JSON.stringify(
      {
        priceSnapshot: AI_EVALUATION_PRICE_SNAPSHOT,
        summaries: result.summaries,
        failures: result.records
          .filter((record) => !record.grade.passed)
          .map((record) => ({
            fixtureId: record.fixtureId,
            model: record.model,
            repetition: record.repetition,
            errorCode: record.errorCode,
            grade: record.grade,
          })),
      },
      null,
      2,
    ),
  );
}
