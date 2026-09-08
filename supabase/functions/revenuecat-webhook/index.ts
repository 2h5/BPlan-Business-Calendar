import { handleRevenueCatWebhook } from './handler.ts';

Deno.serve((request) => handleRevenueCatWebhook(request));
