import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertCoreRoute, callCore, CoreError, coreDestination } from './core-client.ts';
import { requestBody, responseBody } from './contracts.ts';
import { createLoginRoutes } from './login-routes.ts';
import { capabilitiesFor, authorizeOperation } from './authorization.ts';
import { mockAccessReport } from './mock-access-report.ts';

type Config = { baseUrl: string; port: number; origins: Set<string>; writes: boolean; loginContract?: string; loginUrl?: string; adminUrl?: string };
export function configuration(env: NodeJS.ProcessEnv): Config {
  if (!['development', 'test'].includes(env.NODE_ENV ?? '')) throw new Error('Integração local permitida somente em desenvolvimento/teste');
  const baseUrl = coreDestination(env.ANI_CORE_BASE_URL ?? '').origin;
  const port = Number(env.ANI_BFF_PORT ?? 3333);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida');
  const origins = new Set((env.ANI_ALLOWED_ORIGINS ?? 'http://127.0.0.1:4200,http://127.0.0.1:4201,http://localhost:4200,http://localhost:4201').split(',').map(v => v.trim()));
  for (const value of origins) {
    const origin = new URL(value);
    if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Integração local exige origens de browser em loopback');
  }
  if (env.ANI_BFF_ENABLE_WRITES && !['true', 'false'].includes(env.ANI_BFF_ENABLE_WRITES)) throw new Error('ANI_BFF_ENABLE_WRITES deve ser true ou false');
  const loginUrl=env.ANI_LOGIN_FRONTEND_URL || 'http://127.0.0.1:4201/';
  const adminUrl=env.ANI_ADMIN_FRONTEND_URL || 'http://127.0.0.1:4200/';
  for(const value of [loginUrl,adminUrl]) {const target=new URL(value);if(!origins.has(target.origin)||target.pathname!=='/'||target.search||target.hash||target.username||target.password)throw new Error('Destino de login/admin deve ser uma origem local permitida, sem parâmetros');}
  return { baseUrl, port, origins, writes: env.ANI_BFF_ENABLE_WRITES === 'true', loginContract: env.ANI_LOGIN_CONTRACT || 'core-bearer-v1', loginUrl, adminUrl };
}
async function json(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new CoreError(415, 'Content-Type deve ser application/json');
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32768) throw new CoreError(413, 'Corpo excede o limite');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new CoreError(400, 'JSON inválido'); }
}
export function createApiServer(config: Config) {
  const loginRoutes = createLoginRoutes(config.baseUrl, config.loginContract, config.adminUrl);
  let rateStart = Date.now(); let requestCount = 0; let active = 0;
  const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const server = createServer((request, response) => {
    const correlationId = randomUUID();
    response.setHeader('X-Correlation-ID', correlationId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const send = (status: number, value?: unknown) => {
      response.statusCode = status;
      if (status === 204) { response.end(); return; }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(value));
    };
    const execute = async () => {
      if (!['127.0.0.1:' + config.port, 'localhost:' + config.port].includes(request.headers.host ?? '')) throw new CoreError(403, 'Host não permitido');
      if (Date.now() - rateStart >= 60000) { rateStart = Date.now(); requestCount = 0; }
      if (++requestCount > 240) throw new CoreError(429, 'Limite de requisições excedido');
      const url = new URL(request.url ?? '/', 'http://localhost');
      const method = request.method ?? 'GET';
      if (url.pathname === '/bff/health' && method === 'GET') return send(200, { status: 'ok', coreMode: 'api', authMode: 'core', writesEnabled: config.writes });
      const origin = request.headers.origin;
      if (origin && !config.origins.has(origin)) throw new CoreError(403, 'Origem não permitida');
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new CoreError(403, 'Requisição entre sites negada');
      const mutating = !['GET', 'HEAD'].includes(method);
      if (mutating && (!origin || !config.origins.has(origin))) throw new CoreError(403, 'Origem obrigatória');
      const loginReply = await loginRoutes(request, url.pathname === '/bff/auth/logout' ? '/bff/auth/user-logout' : url.pathname, correlationId, () => json(request));
      if (loginReply) {
        if (loginReply.cookie) response.setHeader('Set-Cookie', loginReply.cookie);
        return send(loginReply.status, loginReply.payload);
      }
      const session=loginRoutes.sessionFor(request);
      const authenticated=Boolean(session?.user&&session.authorization);
      const capabilities=capabilitiesFor(session?.permissions??[],config.writes,session?.profiles??[]);
      if(url.pathname==='/bff/session'&&method==='GET') return send(200,{
        authenticated,authMode:'core',coreMode:'api',writesEnabled:config.writes,loginUrl:config.loginUrl??'http://127.0.0.1:4201/',
        capabilities:authenticated?capabilities:[],
        ...(authenticated?{csrfToken:session!.csrf,user:{...session!.user,profileLabel:session!.profiles?.includes('Administrador')?'Administrador':'Usuário autenticado'}}:{})
      });
      if(url.pathname==='/bff/auth/integration')throw new CoreError(404,'Acesso por chave removido; utilize login e senha');
      if(!authenticated)throw new CoreError(401,'Sessão necessária');
      if(mutating&&(typeof request.headers['x-csrf-token']!=='string'||!equal(request.headers['x-csrf-token'],session!.csrf)))throw new CoreError(403,'CSRF inválido');
      if (!url.pathname.startsWith('/bff/api/v1/')) throw new CoreError(404, 'Rota não disponível');
      const path = url.pathname.slice('/bff/api/v1'.length);
      if(path==='/relatorios/acessos'||path.startsWith('/relatorios/acessos/')) {
        if(method!=='GET')throw new CoreError(405,'Relatório demonstrativo permite somente consulta');
        if(!capabilities.includes('reports.read'))throw new CoreError(403,'Operação não permitida para este usuário');
        return send(200,mockAccessReport(path,url.searchParams));
      }
      assertCoreRoute(method, path);
      authorizeOperation(method,path,capabilities);
      if (mutating && !config.writes) throw new CoreError(403, 'Escritas desabilitadas nesta integração');
      const emptyDelete = method === 'DELETE' && (!request.headers['content-length'] || request.headers['content-length'] === '0') && !request.headers['transfer-encoding'];
      const body = mutating ? requestBody(path, method, emptyDelete ? {} : await json(request)) : undefined;
      if (active >= 8) throw new CoreError(503, 'Limite de chamadas simultâneas atingido');
      active++;
      try {
        const result = await callCore(config.baseUrl, method, path, url.searchParams, session!.authorization, method === 'DELETE' ? undefined : body, correlationId);
        if (result.status === 204) return send(204);
        return send(result.status, responseBody(path, method, result.payload, url.searchParams));
      } catch(error) {
        if(error instanceof CoreError&&error.statusCode===401)response.setHeader('Set-Cookie',loginRoutes.revoke(request));
        throw error;
      } finally { active--; }
    };
    void execute().catch(error => {
      const status = error instanceof CoreError ? error.statusCode : 500;
      if (status === 429) response.setHeader('Retry-After', '60');
      // No URL, body, key, token, cookie, personal data or upstream error content in operational logs.
      if (status >= 500) console.error(JSON.stringify({ event: 'bff_request_failed', correlationId, status }));
      if (!response.headersSent) send(status, { title: error instanceof CoreError ? error.message : 'Erro interno do BFF', status, correlationId });
      else response.destroy();
    });
  });
  server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 40;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configuration(process.env);
  const server = createApiServer(config);
  server.listen(config.port, '127.0.0.1', () => console.log(`ANI BFF de integração local na porta ${config.port}`));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}
