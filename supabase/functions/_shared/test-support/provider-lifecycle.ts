import type {
  CalendarProvider,
  ExternalCalendar,
  NormalisedEvent,
  ProviderContext,
  ProviderEventInput,
  ProviderKind,
  SyncResult,
  SyncWindow,
  WatchRegistration,
  WatchScope,
  WatchTarget,
} from '../providers/types.ts';

export interface RecordedHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

type HttpMatcher = {
  method?: string;
  url: string | RegExp;
};

type HttpResponseScript =
  Response | ((request: RecordedHttpRequest) => Response | Promise<Response>);

interface HttpRoute {
  matcher: HttpMatcher;
  responses: HttpResponseScript[];
  nextResponse: number;
}

/**
 * Default-deny HTTP transport for provider lifecycle tests.
 *
 * A route must be scripted before a request can leave the adapter. Exhausted
 * routes and unexpected URLs fail loudly, so a new provider call cannot drift
 * into the real network unnoticed.
 */
export class ScriptedHttpTransport {
  readonly requests: RecordedHttpRequest[] = [];
  private readonly routes: HttpRoute[] = [];

  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const recorded = await recordRequest(request);
    this.requests.push(recorded);

    const route = this.routes.find(
      (candidate) =>
        candidate.nextResponse < candidate.responses.length && matches(candidate.matcher, recorded),
    );
    if (!route) {
      throw new Error(`Unexpected scripted provider request: ${recorded.method} ${recorded.url}`);
    }

    const script = route.responses[route.nextResponse];
    if (!script) {
      throw new Error(`Script exhausted for provider request: ${recorded.method} ${recorded.url}`);
    }
    route.nextResponse += 1;

    const response = typeof script === 'function' ? await script(recorded) : script.clone();
    return response.clone();
  };

  respond(matcher: HttpMatcher, ...responses: HttpResponseScript[]): this {
    if (responses.length === 0) throw new Error('A scripted route needs at least one response.');
    this.routes.push({ matcher, responses, nextResponse: 0 });
    return this;
  }

  assertExhausted(): void {
    for (const route of this.routes) {
      if (route.nextResponse !== route.responses.length) {
        throw new Error(
          `Unused scripted responses remain for ${route.matcher.method ?? '*'} ${String(route.matcher.url)}.`,
        );
      }
    }
  }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function responseWithHeaders(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers });
}

export interface RecordedProviderCall {
  operation:
    | 'listCalendars'
    | 'initialSync'
    | 'incrementalSync'
    | 'createEvent'
    | 'updateEvent'
    | 'deleteEvent'
    | 'watch'
    | 'renewWatch'
    | 'unwatch';
  providerCalendarId?: string;
  providerEventId?: string;
  cursor?: string;
  window?: SyncWindow;
  input?: ProviderEventInput;
  target?: WatchTarget;
  callbackUrl?: string;
  registration?: WatchRegistration;
}

export interface ScriptedProviderPlan {
  kind?: ProviderKind;
  watchScope?: WatchScope;
  listCalendars?: (ctx: ProviderContext) => Promise<ExternalCalendar[]>;
  initialSync?: (
    ctx: ProviderContext,
    providerCalendarId: string,
    window: SyncWindow,
  ) => Promise<SyncResult>;
  incrementalSync?: (
    ctx: ProviderContext,
    providerCalendarId: string,
    cursor: string,
  ) => Promise<SyncResult>;
  createEvent?: (
    ctx: ProviderContext,
    providerCalendarId: string,
    input: ProviderEventInput,
  ) => Promise<NormalisedEvent>;
  updateEvent?: (
    ctx: ProviderContext,
    providerCalendarId: string,
    providerEventId: string,
    input: ProviderEventInput,
  ) => Promise<NormalisedEvent>;
  deleteEvent?: (
    ctx: ProviderContext,
    providerCalendarId: string,
    providerEventId: string,
  ) => Promise<void>;
  watch?: (
    ctx: ProviderContext,
    target: WatchTarget,
    callbackUrl: string,
  ) => Promise<WatchRegistration>;
  renewWatch?: (
    ctx: ProviderContext,
    registration: WatchRegistration,
  ) => Promise<WatchRegistration>;
  unwatch?: (ctx: ProviderContext, registration: WatchRegistration) => Promise<void>;
}

/** Lightweight provider-contract fake for shared orchestration tests. */
export function createScriptedProvider(plan: ScriptedProviderPlan = {}): {
  provider: CalendarProvider;
  calls: RecordedProviderCall[];
} {
  const calls: RecordedProviderCall[] = [];
  const provider: CalendarProvider = {
    kind: plan.kind ?? 'google',
    watchScope: plan.watchScope ?? 'calendar',

    async listCalendars(ctx) {
      calls.push({ operation: 'listCalendars' });
      return plan.listCalendars ? await plan.listCalendars(ctx) : [];
    },

    async initialSync(ctx, providerCalendarId, window) {
      calls.push({ operation: 'initialSync', providerCalendarId, window });
      return plan.initialSync
        ? await plan.initialSync(ctx, providerCalendarId, window)
        : { events: [], cursor: null };
    },

    async incrementalSync(ctx, providerCalendarId, cursor) {
      calls.push({ operation: 'incrementalSync', providerCalendarId, cursor });
      return plan.incrementalSync
        ? await plan.incrementalSync(ctx, providerCalendarId, cursor)
        : { events: [], cursor: null };
    },

    async createEvent(ctx, providerCalendarId, input) {
      calls.push({ operation: 'createEvent', providerCalendarId, input });
      if (!plan.createEvent) throw new Error('No scripted createEvent result.');
      return await plan.createEvent(ctx, providerCalendarId, input);
    },

    async updateEvent(ctx, providerCalendarId, providerEventId, input) {
      calls.push({ operation: 'updateEvent', providerCalendarId, providerEventId, input });
      if (!plan.updateEvent) throw new Error('No scripted updateEvent result.');
      return await plan.updateEvent(ctx, providerCalendarId, providerEventId, input);
    },

    async deleteEvent(ctx, providerCalendarId, providerEventId) {
      calls.push({ operation: 'deleteEvent', providerCalendarId, providerEventId });
      if (plan.deleteEvent) await plan.deleteEvent(ctx, providerCalendarId, providerEventId);
    },

    async watch(ctx, target, callbackUrl) {
      calls.push({ operation: 'watch', target, callbackUrl });
      if (!plan.watch) throw new Error('No scripted watch result.');
      return await plan.watch(ctx, target, callbackUrl);
    },

    async unwatch(ctx, registration) {
      calls.push({ operation: 'unwatch', registration });
      if (plan.unwatch) await plan.unwatch(ctx, registration);
    },
  };

  if (plan.renewWatch) {
    provider.renewWatch = async (ctx, registration) => {
      calls.push({ operation: 'renewWatch', registration });
      return await plan.renewWatch!(ctx, registration);
    };
  }

  return { provider, calls };
}

async function recordRequest(request: Request): Promise<RecordedHttpRequest> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    method: request.method,
    url: request.url,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : await request.text(),
  };
}

function matches(matcher: HttpMatcher, request: RecordedHttpRequest): boolean {
  if (matcher.method && matcher.method !== request.method) return false;
  if (typeof matcher.url === 'string') return matcher.url === request.url;
  matcher.url.lastIndex = 0;
  return matcher.url.test(request.url);
}
