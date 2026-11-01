import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type DemoActor = 'admin' | 'consulta';
type Capability = 'requests.read' | 'requests.approve' | 'users.read' | 'users.write' | 'catalog.read' | 'catalog.write' | 'audit.read' | 'reports.read';
type Session = { actor: DemoActor; id: string; displayName: string; profileLabel: string; capabilities: Capability[]; csrfToken: string; coreAuthorization?: string; expiresAt?: number };
type RouteRule = { capability?: Capability; public?: boolean };

const port = Number(process.env.ANI_BFF_PORT ?? 3333);
const coreBaseUrl = process.env.ANI_CORE_BASE_URL ?? ((process.env.ANI_CORE_MODE ?? 'mock') === 'mock' ? 'http://127.0.0.1:3334' : '');
const mockIdentityBaseUrl = process.env.ANI_MOCK_IDP_URL ?? 'http://127.0.0.1:3335';
const adminFrontendUrl = process.env.ANI_ADMIN_FRONTEND_URL ?? 'http://127.0.0.1:4200/';
const authMode = process.env.ANI_AUTH_MODE ?? 'unconfigured';
const coreMode = process.env.ANI_CORE_MODE ?? 'unconfigured';
const allowedOrigins = new Set((process.env.ANI_ALLOWED_ORIGINS ?? 'http://localhost:4200,http://localhost:4201,http://127.0.0.1:4200,http://127.0.0.1:4201').split(',').map((value) => value.trim()));
const sessions = new Map<string, Session>();
const submitWindows = new Map<string, { count: number; expiresAt: number }>();
const pendingLogins = new Map<string, { verifier: string; expiresAt: number }>();

const demoActors: Record<DemoActor, Omit<Session, 'csrfToken'>> = {
  admin: {
    actor: 'admin', id: 'local-user-admin', displayName: 'Operador de demonstração', profileLabel: 'Administrador (mock)',
    capabilities: ['requests.read', 'requests.approve', 'users.read', 'users.write', 'catalog.read', 'catalog.write', 'audit.read', 'reports.read'],
  },
  consulta: {
    actor: 'consulta', id: 'local-user-consulta', displayName: 'Consulta de demonstração', profileLabel: 'Consulta (mock)',
    capabilities: ['requests.read', 'users.read', 'catalog.read', 'audit.read', 'reports.read'],
  },
};

/** Explicit allowlist: browser paths are never forwarded as an open proxy. */
export function resolveApiRoute(method: string, path: string): RouteRule | undefined {
  const normalizedMethod = method.toUpperCase();
  const collectionRules: Record<string, Partial<Record<string, RouteRule>>> = {
    '/solicitacoes-cadastro': {
      GET: { capability: 'requests.read' }, POST: { public: true },
    },
    '/usuarios': { GET: { capability: 'users.read' }, POST: { capability: 'users.write' } },
    // Public metadata needed by the unauthenticated request form in this local mock.
    '/portais': { GET: { public: true }, POST: { capability: 'catalog.write' } },
    '/perfis': { GET: { capability: 'catalog.read' }, POST: { capability: 'catalog.write' } },
    '/permissoes': { GET: { capability: 'catalog.read' }, POST: { capability: 'catalog.write' } },
    '/auditoria': { GET: { capability: 'audit.read' } },
    '/relatorios/acessos': { GET: { capability: 'reports.read' } },
  };
  const collection = collectionRules[path]?.[normalizedMethod];
  if (collection) return collection;

  if (normalizedMethod === 'GET' && /^\/solicitacoes-cadastro\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'requests.read' };
  if (normalizedMethod === 'POST' && /^\/solicitacoes-cadastro\/[a-zA-Z0-9-]+\/(aprovar|rejeitar)$/.test(path)) return { capability: 'requests.approve' };
  if (normalizedMethod === 'GET' && /^\/usuarios\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'users.read' };
  if (['PUT', 'PATCH', 'DELETE'].includes(normalizedMethod) && /^\/usuarios\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'users.write' };
  if (normalizedMethod === 'GET' && /^\/usuarios\/[a-zA-Z0-9-]+\/permissoes-efetivas$/.test(path)) return { capability: 'users.read' };
  if (normalizedMethod === 'GET' && /^\/usuarios\/[a-zA-Z0-9-]+\/perfis$/.test(path)) return { capability: 'users.read' };
  if (normalizedMethod === 'POST' && /^\/usuarios\/[a-zA-Z0-9-]+\/perfis$/.test(path)) return { capability: 'users.write' };
  if (normalizedMethod === 'DELETE' && /^\/usuarios\/[a-zA-Z0-9-]+\/perfis\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'users.write' };
  if (normalizedMethod === 'GET' && /^\/auditoria\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'audit.read' };
  if (normalizedMethod === 'GET' && /^\/(?:portais|perfis|permissoes)\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'catalog.read' };
  if (['PUT', 'PATCH', 'DELETE'].includes(normalizedMethod) && /^\/(?:portais|perfis|permissoes)\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'catalog.write' };
  if (normalizedMethod === 'GET' && /^\/perfis\/[a-zA-Z0-9-]+\/permissoes$/.test(path)) return { capability: 'catalog.read' };
  if (normalizedMethod === 'POST' && /^\/perfis\/[a-zA-Z0-9-]+\/permissoes$/.test(path)) return { capability: 'catalog.write' };
  if (normalizedMethod === 'DELETE' && /^\/perfis\/[a-zA-Z0-9-]+\/permissoes\/[a-zA-Z0-9-]+$/.test(path)) return { capability: 'catalog.write' };
  return undefined;
}

function send(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

function redirect(response: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  response.end();
}

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const target = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return target ? decodeURIComponent(target.slice(name.length + 1)) : undefined;
}

async function readJson(request: IncomingMessage, maxBytes = 32_768): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object');
    return parsed as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
  }
}

function originAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return typeof origin === 'string' && allowedOrigins.has(origin);
}

function sessionFor(request: IncomingMessage): Session | undefined {
  const sessionId = cookieValue(request, 'ani_session');
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (session?.expiresAt && session.expiresAt <= Date.now()) { sessions.delete(sessionId!); return undefined; }
  return session;
}

function toPublicSession(session?: Session) {
  return {
    authenticated: Boolean(session),
    authMode: authMode === 'mock' ? 'mock' : 'unconfigured',
    ...(session ? {
      user: { id: session.id, displayName: session.displayName, profileLabel: session.profileLabel },
      capabilities: session.capabilities,
      csrfToken: session.csrfToken,
    } : { capabilities: [] }),
  };
}

async function proxyToCore(request: IncomingMessage, response: ServerResponse, path: string, url: URL, session?: Session, preparedBody?: Record<string, unknown>): Promise<void> {
  const rule = resolveApiRoute(request.method ?? 'GET', path);
  if (!rule) return send(response, 404, { title: 'Rota não disponível no BFF', status: 404 });
  if (!rule.public && !session) return send(response, 401, { title: 'Sessão necessária', status: 401 });
  if (rule.capability && !session?.capabilities.includes(rule.capability)) {
    return send(response, 403, { title: 'Acesso não autorizado', status: 403 });
  }
  if (!originAllowed(request) && request.method !== 'GET') return send(response, 403, { title: 'Origem não permitida', status: 403 });
  if (!rule.public && request.method !== 'GET' && request.headers['x-csrf-token'] !== session?.csrfToken) {
    return send(response, 403, { title: 'CSRF token inválido', status: 403 });
  }

  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    const parsed = preparedBody ?? await readJson(request);
    body = JSON.stringify(parsed);
  }
  const target = new URL(`/api/v1${path}`, coreBaseUrl);
  target.search = url.search;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const coreResponse = await fetch(target, {
      method: request.method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
      signal: controller.signal,
    });
    if (coreResponse.status === 204) {
      response.writeHead(204, { 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    const contentType = coreResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return send(response, 502, { title: 'Resposta inválida do mock de contrato', status: 502 });
    }
    const payload = await coreResponse.json();
    send(response, coreResponse.status, payload);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    send(response, timedOut ? 504 : 502, { title: timedOut ? 'Tempo limite da API ANI excedido' : 'API ANI local indisponível', status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function rateLimitSubmission(request: IncomingMessage): boolean {
  const key = request.socket.remoteAddress ?? 'local';
  const now = Date.now();
  const window = submitWindows.get(key);
  if (!window || window.expiresAt <= now) {
    submitWindows.set(key, { count: 1, expiresAt: now + 60_000 });
    return true;
  }
  if (window.count >= 8) return false;
  window.count += 1;
  return true;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const session = sessionFor(request);

  if (request.method === 'GET' && url.pathname === '/bff/health') return send(response, 200, { status: 'ok', coreMode, authMode, integrationReady: false });
  if (request.method === 'GET' && url.pathname === '/bff/session') return send(response, 200, toPublicSession(session));

  if (request.method === 'GET' && url.pathname === '/bff/auth/login') {
    if (process.env.NODE_ENV !== 'development' || authMode !== 'mock') return send(response, 404, { title: 'Not found', status: 404 });
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    pendingLogins.set(state, { verifier, expiresAt: Date.now() + 300_000 });
    const authorize = new URL('/authorize', mockIdentityBaseUrl);
    authorize.searchParams.set('client_id', 'ani-admin-local');
    authorize.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/bff/auth/callback`);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    return redirect(response, authorize.toString());
  }

  if (request.method === 'GET' && url.pathname === '/bff/auth/callback') {
    if (process.env.NODE_ENV !== 'development' || authMode !== 'mock') return send(response, 404, { title: 'Not found', status: 404 });
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const transaction = state ? pendingLogins.get(state) : undefined;
    if (!code || !state || !transaction || transaction.expiresAt < Date.now()) {
      if (state) pendingLogins.delete(state);
      return send(response, 400, { title: 'Retorno de identidade inválido ou expirado', status: 400 });
    }
    pendingLogins.delete(state);
    const tokenResponse = await fetch(new URL('/token', mockIdentityBaseUrl), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'ani-admin-local', code, redirect_uri: `http://127.0.0.1:${port}/bff/auth/callback`, code_verifier: transaction.verifier }),
    });
    if (!tokenResponse.ok) return send(response, 401, { title: 'O provedor local não aceitou o código', status: 401 });
    const token = await tokenResponse.json() as { sub?: string };
    const actor = token.sub === 'demo-admin-sub' ? 'admin' : undefined;
    if (!actor) return send(response, 403, { title: 'Identidade de demonstração sem acesso ao ANI Admin', status: 403 });
    const sessionId = randomBytes(32).toString('base64url');
    const nextSession: Session = { ...demoActors[actor], csrfToken: randomBytes(32).toString('base64url') };
    sessions.set(sessionId, nextSession);
    return redirect(response, adminFrontendUrl, {
      'Set-Cookie': `ani_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`,
    });
  }

  if (request.method === 'POST' && url.pathname === '/bff/dev/auth/login') {
    if (process.env.NODE_ENV !== 'development' || authMode !== 'mock') return send(response, 404, { title: 'Not found', status: 404 });
    if (!originAllowed(request)) return send(response, 403, { title: 'Origem não permitida', status: 403 });
    const body = await readJson(request);
    const actor = body['actor'];
    if (actor !== 'admin' && actor !== 'consulta') return send(response, 400, { title: 'Cenário local desconhecido', status: 400 });
    const sessionId = randomBytes(32).toString('base64url');
    const actorData = demoActors[actor];
    const nextSession: Session = { ...actorData, csrfToken: randomBytes(32).toString('base64url') };
    sessions.set(sessionId, nextSession);
    return send(response, 200, toPublicSession(nextSession), {
      'Set-Cookie': `ani_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`,
    });
  }

  if (request.method === 'POST' && url.pathname === '/bff/auth/logout') {
    if (!originAllowed(request) || !session || request.headers['x-csrf-token'] !== session.csrfToken) {
      return send(response, 403, { title: 'Logout não autorizado', status: 403 });
    }
    const sessionId = cookieValue(request, 'ani_session');
    if (sessionId) sessions.delete(sessionId);
    return send(response, 200, { ok: true }, { 'Set-Cookie': 'ani_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }

  if (url.pathname === '/bff/api/v1/solicitacoes-cadastro' && request.method === 'POST') {
    if (!originAllowed(request)) return send(response, 403, { title: 'Origem não permitida', status: 403 });
    if (!rateLimitSubmission(request)) return send(response, 429, { title: 'Tente novamente mais tarde', status: 429 });
    if ((request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return send(response, 415, { title: 'Envie a solicitação no formato JSON', status: 415 });
    }
    const input = await readJson(request);
    const name = typeof input['nome'] === 'string' ? input['nome'].trim() : '';
    const email = typeof input['email'] === 'string' ? input['email'].trim() : '';
    const systemId = typeof input['sistemaId'] === 'string' ? input['sistemaId'].trim() : '';
    const justification = input['justificativa'] === undefined ? '' : typeof input['justificativa'] === 'string' ? input['justificativa'].trim() : null;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const allowedKeys = new Set(['nome', 'email', 'sistemaId', 'justificativa']);
    if ([...Object.keys(input)].some((key) => !allowedKeys.has(key))
      || !name || name.length > 120
      || !emailPattern.test(email) || email.length > 180
      || !systemId || systemId.length > 80
      || justification === null || justification.length > 500) {
      return send(response, 400, { title: 'Confira nome, e-mail, sistema e limites de caracteres', status: 400 });
    }
    const preparedBody = { nome: name, email, sistemaId: systemId, ...(justification ? { justificativa: justification } : {}) };
    return proxyToCore(request, response, '/solicitacoes-cadastro', url, session, preparedBody);
  }

  if (url.pathname.startsWith('/bff/api/v1/')) {
    const path = url.pathname.slice('/bff/api/v1'.length) || '/';
    const allowedQuery = new Set(['page', 'pageSize', 'search', 'status', 'sistemaId', 'sort', 'order']);
    if ([...url.searchParams.keys()].some((key) => !allowedQuery.has(key))) {
      return send(response, 400, { title: 'Parâmetro de consulta não permitido', status: 400 });
    }
    return proxyToCore(request, response, path, url, session);
  }
  send(response, 404, { title: 'Not found', status: 404 });
}

if (nodeEnv !== 'development' || authMode !== 'mock' || coreMode !== 'mock') {
  throw new Error('Servidor mock exige NODE_ENV=development, ANI_AUTH_MODE=mock e ANI_CORE_MODE=mock. Use api-server.ts para integração.');
}
if (!['127.0.0.1', 'localhost'].includes(new URL(coreBaseUrl).hostname)) {
  throw new Error('Mock Core deve permanecer em loopback.');
}
if (!['127.0.0.1', 'localhost'].includes(new URL(mockIdentityBaseUrl).hostname)
  || !['127.0.0.1', 'localhost'].includes(new URL(adminFrontendUrl).hostname)) {
  throw new Error('O fluxo de identidade demonstrativo só pode usar serviços locais.');
}

createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const path = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`).pathname;
    const errorMessage = error instanceof Error ? error.message.slice(0, 160) : '';
    console.error(JSON.stringify({ event: 'local_bff_request_failed', method: request.method ?? 'GET', path, statusCode, errorName, errorMessage }));
    send(response, statusCode, { title: statusCode === 500 ? 'Erro inesperado' : 'Requisição inválida', status: statusCode });
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`ANI Admin BFF local disponível em http://127.0.0.1:${port}/bff/health`);
});
