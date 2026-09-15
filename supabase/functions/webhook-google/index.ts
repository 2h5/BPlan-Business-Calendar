import { handleGoogleWebhook } from './handler.ts';

Deno.serve((request) => handleGoogleWebhook(request));
