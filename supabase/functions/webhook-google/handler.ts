import { adminClient } from '../_shared/auth/index.ts';
import { runAfterResponse } from '../_shared/http/background.ts';
import { JOB_KINDS, calendarSyncKey, enqueue } from '../_shared/sync/jobs.ts';
import { drainQueue } from '../_shared/sync/worker.ts';

type GoogleWebhookJob = Parameters<typeof enqueue>[1];
type GoogleWebhookEnqueue = (job: GoogleWebhookJob) => ReturnType<typeof enqueue>;

export interface GoogleWebhookState {
  id: string;
  calendar_id: string | null;
  provider_account_id: string | null;
  webhook_token: string | null;
  webhook_resource_id: string | null;
}

export interface GoogleWebhookAccount {
  user_id: string;
}

export interface GoogleWebhookDeps {
  lookupState?: (channelId: string) => Promise<GoogleWebhookState | null>;
  lookupAccount?: (providerAccountId: string) => Promise<GoogleWebhookAccount | null>;
  enqueue?: GoogleWebhookEnqueue;
  afterResponse?: (work: () => Promise<void>) => Promise<void>;
  now?: () => Date;
}

/**
 * Fast Google Calendar notification handler.
 *
 * The notification body is deliberately ignored. A verified channel only
 * selects the durable incremental-sync job; the provider adapter remains the
 * sole owner of reading and applying Google changes.
 */
export async function handleGoogleWebhook(
  request: Request,
  deps: GoogleWebhookDeps = {},
): Promise<Response> {
  if (request.method === 'GET') return new Response('ok', { status: 200 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const channelId = request.headers.get('X-Goog-Channel-ID');
  const token = request.headers.get('X-Goog-Channel-Token');
  const resourceId = request.headers.get('X-Goog-Resource-ID');
  const resourceState = request.headers.get('X-Goog-Resource-State');

  // `sync` is the handshake Google sends when a channel is created. There is
  // nothing to fetch yet, and the handshake does not carry delivery proof.
  if (resourceState === 'sync' || !channelId) {
    return acceptedResponse();
  }

  try {
    let admin: ReturnType<typeof adminClient> | null = null;
    const getAdmin = () => {
      admin ??= adminClient();
      return admin;
    };
    const lookupState = deps.lookupState ?? ((id: string) => lookupGoogleState(getAdmin(), id));
    const lookupAccount =
      deps.lookupAccount ?? ((id: string) => lookupGoogleAccount(getAdmin(), id));
    const enqueueJob: GoogleWebhookEnqueue = deps.enqueue ?? ((job) => enqueue(getAdmin(), job));
    const now = deps.now ?? (() => new Date());
    const afterResponse =
      deps.afterResponse ??
      ((work) => runAfterResponse(() => drainQueue(getAdmin(), 5).then(() => work())));

    const state = await lookupState(channelId);

    // A stopped channel can still deliver briefly. A missing proof must never
    // turn an arbitrary request into work for a guessed channel.
    if (
      !state?.calendar_id ||
      !state.provider_account_id ||
      !token ||
      !resourceId ||
      token !== state.webhook_token ||
      resourceId !== state.webhook_resource_id
    ) {
      console.warn(JSON.stringify({ code: 'WEBHOOK_TOKEN_OR_RESOURCE_MISMATCH' }));
      return acceptedResponse();
    }

    const account = await lookupAccount(state.provider_account_id);
    if (!account) return acceptedResponse();

    await enqueueJob({
      userId: account.user_id,
      providerAccountId: state.provider_account_id,
      kind: JOB_KINDS.calendarSync,
      payload: { calendarId: state.calendar_id },
      idempotencyKey: calendarSyncKey(state.calendar_id, now()),
    });

    await afterResponse(async () => undefined);
    return acceptedResponse();
  } catch (error) {
    // Deliberately still a 2xx. Losing one notification costs us until daily
    // reconciliation; teaching Google to stop delivering costs the channel.
    console.error(JSON.stringify({ code: 'WEBHOOK_FAILED', detail: String(error) }));
    return acceptedResponse();
  }
}

async function lookupGoogleState(
  admin: ReturnType<typeof adminClient>,
  channelId: string,
): Promise<GoogleWebhookState | null> {
  const { data } = await admin
    .from('calendar_sync_states')
    .select('id, calendar_id, webhook_token, webhook_resource_id, provider_account_id')
    .eq('webhook_channel_id', channelId)
    .maybeSingle();

  return (data as GoogleWebhookState | null) ?? null;
}

async function lookupGoogleAccount(
  admin: ReturnType<typeof adminClient>,
  providerAccountId: string,
): Promise<GoogleWebhookAccount | null> {
  const { data } = await admin
    .from('provider_accounts')
    .select('user_id')
    .eq('id', providerAccountId)
    .maybeSingle();

  return (data as GoogleWebhookAccount | null) ?? null;
}

function acceptedResponse(): Response {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
