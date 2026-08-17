/**
 * The request router — the mobile stand-in for backend/main.py.
 *
 * The desktop frontend reaches Python over HTTP and one WebSocket, and it reaches
 * it *only* through `window.BACKEND` / `window.WS_BACKEND`. It has no other
 * coupling to the server. That is what makes this port tractable: the UI does not
 * need rewriting, it needs the same contract answered locally.
 *
 * So this file owns the contract, not the transport. `src/bridge/` intercepts
 * fetch and WebSocket inside the WebView and hands the request here; nothing in
 * the UI knows the difference.
 *
 * Paths and response shapes must match backend/main.py exactly. When they drift,
 * the UI breaks in ways that look like UI bugs, so the tests compare against the
 * documented shapes rather than against whatever this happens to return.
 */

export type Req = {
  method: string;
  /** Path with the leading slash, query string stripped. */
  path: string;
  query: Record<string, string>;
  body: unknown;
};

export type Res = {
  status: number;
  body: unknown;
};

export type Handler = (req: Req) => Promise<Res> | Res;

/** Route key: "GET /companion". Params use ":name" segments. */
const routes = new Map<string, Handler>();

export function route(method: string, path: string, handler: Handler): void {
  routes.set(`${method.toUpperCase()} ${path}`, handler);
}

export function ok(body: unknown): Res {
  return { status: 200, body };
}

/** Split "/a/b?x=1" into its path and decoded query. */
export function parseUrl(url: string): { path: string; query: Record<string, string> } {
  // Absolute or relative; only the part after the origin matters.
  const withoutOrigin = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const [rawPath, rawQuery = ''] = withoutOrigin.split('?');
  const query: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return { path: rawPath || '/', query };
}

/** Match a concrete path against a registered pattern with ":param" segments. */
function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      params[p[i].slice(1)] = decodeURIComponent(a[i]);
    } else if (p[i] !== a[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Dispatch one request. Unknown routes return 404 rather than throwing, because
 * the UI already tolerates a failed fetch on several paths (it wraps them in
 * try/catch and carries on), and a rejected promise there would surface as an
 * unhandled error instead of the graceful degradation it was written for.
 */
export async function handle(
  method: string,
  url: string,
  body: unknown = null,
): Promise<Res> {
  const { path, query } = parseUrl(url);
  const m = method.toUpperCase();

  const exact = routes.get(`${m} ${path}`);
  if (exact) return exact({ method: m, path, query, body });

  for (const [key, handler] of routes) {
    const [rm, pattern] = key.split(' ');
    if (rm !== m || !pattern.includes(':')) continue;
    const params = match(pattern, path);
    if (params) {
      return handler({ method: m, path, query: { ...query, ...params }, body });
    }
  }

  return { status: 404, body: { detail: `no route for ${m} ${path}` } };
}

/** Every registered route, for the coverage test against backend/main.py. */
export function registered(): string[] {
  return [...routes.keys()].sort();
}

export function reset(): void {
  routes.clear();
}
