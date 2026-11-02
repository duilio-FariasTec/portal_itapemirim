import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, normalize, resolve } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertCoreRoute, callCore, changeCorePassword, CoreError, coreDestination } from './core-client.ts';
import { initialPassword, object, requestBody, responseBody } from './contracts.ts';
import { createLoginRoutes } from './login-routes.ts';
import { capabilitiesFor, authorizeOperation } from './authorization.ts';
import { mockAccessReport } from './mock-access-report.ts';

type Config = { baseUrl: string; port: number; bindHost?: string; origins: Set<string>; sameOriginHost?: boolean; writes: boolean; publicRegistration?: boolean; loginContract?: string; loginUrl?: string; adminUrl?: string; staticDir?: string };
export function configuration(env: NodeJS.ProcessEnv): Config {
  const isHomolog = env.NODE_ENV === 'homologation' || env.ANI_BFF_HOMOLOGATION === 'true';
  if (!['development', 'test'].includes(env.NODE_ENV ?? '') && !isHomolog) throw new Error('Integração local permitida somente em desenvolvimento/teste');
  const baseUrl = coreDestination(env.ANI_CORE_BASE_URL ?? '').origin;
  const port = Number(env.ANI_BFF_PORT ?? (isHomolog ? 8080 : 3333));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida');
  const origins = new Set((env.ANI_ALLOWED_ORIGINS ?? 'http://127.0.0.1:4200,http://127.0.0.1:4201,http://localhost:4200,http://localhost:4201').split(',').map(v => v.trim()));
  for (const value of origins) {
    const origin = new URL(value);
    if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Integração local exige origens de browser em loopback');
    if (!isHomolog && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Integração local exige origens de browser em loopback');
  }
  if (env.ANI_BFF_ENABLE_WRITES && !['true', 'false'].includes(env.ANI_BFF_ENABLE_WRITES)) throw new Error('ANI_BFF_ENABLE_WRITES deve ser true ou false');
  if (env.ANI_BFF_ENABLE_PUBLIC_REGISTRATION && !['true', 'false'].includes(env.ANI_BFF_ENABLE_PUBLIC_REGISTRATION)) throw new Error('ANI_BFF_ENABLE_PUBLIC_REGISTRATION deve ser true ou false');
  const loginUrl=env.ANI_LOGIN_FRONTEND_URL || (isHomolog ? '/login/' : 'http://127.0.0.1:4201/');
  const adminUrl=env.ANI_ADMIN_FRONTEND_URL || (isHomolog ? '/admin/' : 'http://127.0.0.1:4200/');
  for(const value of [loginUrl,adminUrl]) {if(isHomolog&&value.startsWith('/')&&!value.startsWith('//')&&!/[?#\s]/.test(value))continue;const target=new URL(value);if(!origins.has(target.origin)||target.pathname!=='/'||target.search||target.hash||target.username||target.password)throw new Error('Destino de login/admin deve ser uma origem local permitida, sem parâmetros');}
  const bindHost = env.ANI_BFF_HOST || (isHomolog ? '0.0.0.0' : '127.0.0.1');
  const staticDir = env.ANI_STATIC_DIR ? resolve(env.ANI_STATIC_DIR) : undefined;
  return { baseUrl, port, bindHost, origins, sameOriginHost: isHomolog, writes: env.ANI_BFF_ENABLE_WRITES === 'true', publicRegistration: env.ANI_BFF_ENABLE_PUBLIC_REGISTRATION === 'true', loginContract: env.ANI_LOGIN_CONTRACT || 'core-bearer-v1', loginUrl, adminUrl, staticDir };
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
const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
function serveStaticApp(staticDir: string, pathname: string, response: ServerResponse): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/admin') {
    response.statusCode = 302;
    response.setHeader('Location', pathname === '/admin' ? '/admin/' : '/login/');
    response.end();
    return true;
  }
  const appPrefix = pathname.startsWith('/login/') ? '/login/' : pathname.startsWith('/admin/') ? '/admin/' : undefined;
  if (!appPrefix) return false;
  const appDir = resolve(staticDir, appPrefix === '/login/' ? 'login' : 'admin');
  const relativePath = normalize(pathname.slice(appPrefix.length)).replace(/^(\.\.(\/|\\|$))+/, '');
  let targetFile = resolve(appDir, relativePath || 'index.html');
  if (!targetFile.startsWith(appDir)) return false;
  if (!existsSync(targetFile) || statSync(targetFile).isDirectory()) {
    if (extname(relativePath)) return false;
    targetFile = resolve(appDir, 'index.html');
    if (!existsSync(targetFile)) return false;
  }
  const ext = extname(targetFile).toLowerCase();
  response.statusCode = 200;
  response.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  if (ext && ext !== '.html') response.setHeader('Cache-Control', 'public, max-age=86400');
  response.end(readFileSync(targetFile));
  return true;
}
export function createApiServer(config: Config) {
  const loginRoutes = createLoginRoutes(config.baseUrl, config.loginContract, config.adminUrl, config.publicRegistration);
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
      const hostHeader = (request.headers.host ?? '').trim().toLowerCase();
      const localHost = ['127.0.0.1:' + config.port, 'localhost:' + config.port].includes(hostHeader);
      if (!localHost && (!config.sameOriginHost || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(hostHeader))) throw new CoreError(403, 'Host não permitido');
      if (Date.now() - rateStart >= 60000) { rateStart = Date.now(); requestCount = 0; }
      if (++requestCount > 240) throw new CoreError(429, 'Limite de requisições excedido');
      const url = new URL(request.url ?? '/', 'http://localhost');
      const method = request.method ?? 'GET';
      if ((url.pathname === '/bff/health' || url.pathname === '/health') && method === 'GET') return send(200, { status: 'ok', coreMode: 'api', authMode: 'core', writesEnabled: config.writes });
      if (config.staticDir && !url.pathname.startsWith('/bff/') && ['GET', 'HEAD'].includes(method)) {
        if (serveStaticApp(config.staticDir, url.pathname, response)) return;
        throw new CoreError(404, 'Página não encontrada');
      }
      const origin = request.headers.origin;
      const isAllowedOrigin = (value?: string) => Boolean(value && (config.origins.has(value) || (config.sameOriginHost && hostHeader && (() => { try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && parsed.host.toLowerCase() === hostHeader; } catch { return false; } })())));
      if (origin && !isAllowedOrigin(origin)) throw new CoreError(403, 'Origem não permitida');
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new CoreError(403, 'Requisição entre sites negada');
      const mutating = !['GET', 'HEAD'].includes(method);
      if (mutating && !isAllowedOrigin(origin)) throw new CoreError(403, 'Origem obrigatória');
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
      if (!url.pathname.startsWith('/bff/api/v1/')) throw new CoreError(404, 'Rota não disponível');
      const path = url.pathname.slice('/bff/api/v1'.length);
      const registrationRequest = !authenticated && method === 'POST' && path === '/usuarios' && url.searchParams.size === 0;
      if (registrationRequest && !config.publicRegistration) throw new CoreError(403, 'Cadastro público desabilitado nesta integração');
      const publicUserRegistration = registrationRequest && config.publicRegistration === true;
      const publicActiveSystems = !authenticated
        && method === 'GET'
        && path === '/sistemas'
        && url.searchParams.get('status') === 'ativo'
        && [...url.searchParams.keys()].every(key => ['page', 'pageSize', 'status'].includes(key));
      if(!authenticated && !publicActiveSystems && !publicUserRegistration)throw new CoreError(401,'Sessão necessária');
      if(mutating&&(!session||typeof request.headers['x-csrf-token']!=='string'||!equal(request.headers['x-csrf-token'],session.csrf)))throw new CoreError(403,'CSRF inválido');
      const loadOwnProfile = async () => {
        const userId = session?.user?.id;
        if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || !session?.authorization) {
          throw new CoreError(401, 'Identidade autenticada inválida');
        }
        const userPath = `/usuarios/${userId}`;
        const result = await callCore(config.baseUrl, 'GET', userPath, new URLSearchParams(), session.authorization, undefined, correlationId);
        const profile = object(responseBody(userPath, 'GET', result.payload, new URLSearchParams()));
        if (profile['id'] !== userId) throw new CoreError(502, 'Identidade divergente na resposta da API');
        return profile;
      };
      if (path === '/me') {
        if (method !== 'GET') throw new CoreError(405, 'Método não permitido');
        if (url.searchParams.size) throw new CoreError(400, 'Parâmetros não permitidos');
        if (active >= 8) throw new CoreError(503, 'Limite de chamadas simultâneas atingido');
        active++;
        try {
          return send(200, await loadOwnProfile());
        } catch (error) {
          if (error instanceof CoreError && error.statusCode === 401) response.setHeader('Set-Cookie', loginRoutes.revoke(request));
          throw error;
        } finally { active--; }
      }
      if (path === '/me/acessos') {
        if (method !== 'GET') throw new CoreError(405, 'Método não permitido');
        if (url.searchParams.size) throw new CoreError(400, 'Parâmetros não permitidos');
        const userId = session?.user?.id;
        if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || !session?.authorization) {
          throw new CoreError(401, 'Identidade autenticada inválida');
        }
        if (active >= 8) throw new CoreError(503, 'Limite de chamadas simultâneas atingido');
        active++;
        try {
          const profilesPath = `/usuarios/${userId}/perfis`;
          const effectivePath = `/usuarios/${userId}/permissoes-efetivas`;
          const [profiles, effective] = await Promise.allSettled([
            callCore(config.baseUrl, 'GET', profilesPath, new URLSearchParams(), session.authorization, undefined, correlationId),
            callCore(config.baseUrl, 'GET', effectivePath, new URLSearchParams(), session.authorization, undefined, correlationId),
          ]);
          const failures = [profiles, effective].flatMap(item => item.status === 'rejected' ? [item.reason] : []);
          const unauthorized = failures.find(reason => reason instanceof CoreError && reason.statusCode === 401);
          if (unauthorized) throw unauthorized;
          // Core may not expose relation queries to non-administrators; the login-confirmed claims remain a safe summary.
          const unexpected = failures.find(reason => !(reason instanceof CoreError) || ![403, 404].includes(reason.statusCode));
          if (unexpected) throw unexpected;
          if (profiles.status === 'fulfilled' && effective.status === 'fulfilled') {
            const profileItems = object(responseBody(profilesPath, 'GET', profiles.value.payload, new URLSearchParams()))['items'];
            const permissionItems = object(responseBody(effectivePath, 'GET', effective.value.payload, new URLSearchParams()))['permissoes'];
            return send(200, { origem: 'api', perfis: profileItems, permissoes: permissionItems });
          }
          return send(200, {
            origem: 'sessao',
            perfis: (session.profiles ?? []).map(nome => ({ nome })),
            permissoes: (session.permissions ?? []).map(codigo => ({ codigo, nome: codigo })),
          });
        } catch (error) {
          if (error instanceof CoreError && error.statusCode === 401) response.setHeader('Set-Cookie', loginRoutes.revoke(request));
          throw error;
        } finally { active--; }
      }
      if (path === '/auth/trocar-senha') {
        if (method !== 'POST') throw new CoreError(405, 'Método não permitido');
        if (url.searchParams.size) throw new CoreError(400, 'Parâmetros não permitidos');
        if (!config.writes) throw new CoreError(403, 'Escritas desabilitadas nesta integração');
        if (!session) throw new CoreError(401, 'Sessão necessária');
        const input = await json(request);
        if (Object.keys(input).sort().join(',') !== 'novaSenha,senhaAtual'
          || typeof input['senhaAtual'] !== 'string' || !input['senhaAtual'] || input['senhaAtual'].length > 256
          || typeof input['novaSenha'] !== 'string' || input['novaSenha'].length < 8 || input['novaSenha'].length > 256
          || input['novaSenha'] === input['senhaAtual']) {
          input['senhaAtual'] = '';
          input['novaSenha'] = '';
          throw new CoreError(400, 'Informe a senha atual e uma nova senha de 8 a 256 caracteres, diferente da atual');
        }
        if (session.busy) {
          input['senhaAtual'] = '';
          input['novaSenha'] = '';
          throw new CoreError(409, 'Uma operação já está em andamento');
        }
        if (active >= 8) {
          input['senhaAtual'] = '';
          input['novaSenha'] = '';
          throw new CoreError(503, 'Limite de chamadas simultâneas atingido');
        }
        const now = Date.now();
        if (session.passwordWindowStart === undefined || now - session.passwordWindowStart >= 60000) {
          session.passwordWindowStart = now;
          session.passwordAttemptCount = 0;
        }
        if ((session.passwordAttemptCount ?? 0) >= 5) {
          input['senhaAtual'] = '';
          input['novaSenha'] = '';
          throw new CoreError(429, 'Muitas tentativas. Aguarde antes de tentar novamente');
        }
        session.passwordAttemptCount = (session.passwordAttemptCount ?? 0) + 1;
        session.busy = true;
        active++;
        try {
          const profile = await loadOwnProfile();
          const identity = session;
          if (!identity?.user || !identity.authorization || loginRoutes.sessionFor(request) !== identity) {
            throw new CoreError(403, 'Sessão encerrada; autentique-se novamente');
          }
          const login = profile['login'];
          if (typeof login !== 'string' || !login.trim() || login.trim().length > 254) {
            throw new CoreError(502, 'Login ausente ou inválido no perfil da API');
          }
          const changeRequest = {
            usuario: login.trim(),
            senhaAtual: input['senhaAtual'],
            novaSenha: input['novaSenha'],
          };
          try {
            await changeCorePassword(config.baseUrl, identity.authorization, changeRequest, correlationId);
          } finally {
            changeRequest.senhaAtual = '';
            changeRequest.novaSenha = '';
          }
          return send(200, { ok: true });
        } catch (error) {
          if (error instanceof CoreError && error.statusCode === 401) response.setHeader('Set-Cookie', loginRoutes.revoke(request));
          throw error;
        } finally {
          input['senhaAtual'] = '';
          input['novaSenha'] = '';
          session.busy = false;
          active--;
        }
      }
      if(path==='/relatorios/acessos'||path.startsWith('/relatorios/acessos/')) {
        if(method!=='GET')throw new CoreError(405,'Relatório demonstrativo permite somente consulta');
        if(!capabilities.includes('reports.read'))throw new CoreError(403,'Operação não permitida para este usuário');
        return send(200,mockAccessReport(path,url.searchParams));
      }
      assertCoreRoute(method, path);
      if (!publicActiveSystems && !publicUserRegistration) authorizeOperation(method,path,capabilities);
      if (mutating && !config.writes && !publicUserRegistration) throw new CoreError(403, 'Escritas desabilitadas nesta integração');
      const emptyDelete = method === 'DELETE' && (!request.headers['content-length'] || request.headers['content-length'] === '0') && !request.headers['transfer-encoding'];
      const input = mutating ? emptyDelete ? {} : await json(request) : undefined;
      if (publicUserRegistration && (!input || Object.keys(input).sort().join(',') !== 'email,login,nome,senha')) {
        throw new CoreError(422, 'Cadastro público aceita somente nome, e-mail, login e senha');
      }
      const adminUserRegistration = authenticated && !publicUserRegistration && method === 'POST' && path === '/usuarios';
      if (adminUserRegistration && input && 'senha' in input) {
        input['senha'] = '';
        throw new CoreError(422, 'A senha inicial é definida pelo BFF e não deve ser enviada');
      }
      const body = input ? requestBody(path, method, input) : undefined;
      if (adminUserRegistration && body) body['senha'] = initialPassword(body['nome']);
      if (publicUserRegistration && (body?.['login'] !== body?.['email'] || typeof body?.['senha'] !== 'string' || !body['senha'])) {
        throw new CoreError(400, 'Login público deve corresponder ao e-mail e a senha é obrigatória');
      }
      if (publicUserRegistration) {
        const now = Date.now();
        if (session!.registrationWindowStart === undefined || now - session!.registrationWindowStart >= 60000) {
          session!.registrationWindowStart = now;
          session!.registrationCount = 0;
        }
        if ((session!.registrationCount ?? 0) >= 3) throw new CoreError(429, 'Limite de cadastros por sessão excedido');
        session!.registrationCount = (session!.registrationCount ?? 0) + 1;
      }
      if (active >= 8) throw new CoreError(503, 'Limite de chamadas simultâneas atingido');
      active++;
      try {
        const result = await callCore(config.baseUrl, method, path, url.searchParams, session?.authorization, method === 'DELETE' ? undefined : body, correlationId);
        if (result.status === 204) return send(204);
        return send(result.status, responseBody(path, method, result.payload, url.searchParams));
      } catch(error) {
        if(error instanceof CoreError&&error.statusCode===401)response.setHeader('Set-Cookie',loginRoutes.revoke(request));
        throw error;
      } finally {
        active--;
        if (body && 'senha' in body) body['senha'] = '';
      }
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
  server.listen(config.port, config.bindHost ?? '127.0.0.1', () => console.log(`ANI BFF em execução em ${config.bindHost ?? '127.0.0.1'}:${config.port}`));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}
