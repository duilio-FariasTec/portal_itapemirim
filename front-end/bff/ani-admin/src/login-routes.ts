import type { IncomingMessage } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { authenticateCore, credentials, type LoginIdentity } from './core-login.ts';
import { CoreError } from './core-client.ts';

type LoginState = { csrf: string; created: number; touched: number; expiresAt: number; user?: LoginIdentity; authorization?: string; permissions?: string[]; profiles?: string[]; busy?: boolean };
type Reply = { status: number; payload: unknown; cookie?: string };
export function createLoginRoutes(baseUrl: string, contract = 'core-bearer-v1', adminUrl = 'http://127.0.0.1:4200/') {
  if (!['core-bearer-v1','disabled'].includes(contract)) throw new Error('ANI_LOGIN_CONTRACT não reconhecido');
  const enabled = contract === 'core-bearer-v1';
  const states = new Map<string, LoginState>();
  let windowStart = Date.now(); let attempts = 0; let active = 0;
  const cookie = (id: string, age: number) => `ani_user_session_v2=${id}; Path=/bff; HttpOnly; SameSite=Strict; Max-Age=${age}`;
  const publicState = (state?: LoginState) => ({ configured: enabled, authenticated: Boolean(state?.user), adminUrl, ...(state ? { csrfToken: state.csrf } : {}), ...(state?.user ? { user: state.user } : {}) });
  const current = (request: IncomingMessage) => {
    const now=Date.now();
    for(const [key,state] of states) if(now>=state.expiresAt || now-state.touched>900000) states.delete(key);
    const id=request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith('ani_user_session_v2='))?.slice('ani_user_session_v2='.length);
    const state=id?states.get(id):undefined;
    if(state) state.touched=now;
    return {id,state};
  };
  const handle = async (request: IncomingMessage, path: string, correlationId: string, readJson: () => Promise<Record<string, unknown>>): Promise<Reply | undefined> => {
    if (!['/bff/auth/context', '/bff/auth/user-session', '/bff/auth/user-login', '/bff/auth/user-logout'].includes(path)) return undefined;
    const method = request.method ?? 'GET';
    if ((path.endsWith('/context') || path.endsWith('/user-session')) ? method !== 'GET' : method !== 'POST') throw new CoreError(405, 'Método não permitido');
    const now = Date.now();
    let {id,state}=current(request);
    if (path.endsWith('/user-session')) return {status:200,payload:publicState(state)};
    if (path.endsWith('/context')) {
      if (!enabled) return {status:200,payload:publicState()};
      if (state) return {status:200,payload:publicState(state)};
      if (states.size >= 100) throw new CoreError(503, 'Limite de sessões atingido');
      const token = randomBytes(32).toString('base64url');
      state = {csrf:randomBytes(32).toString('base64url'),created:now,touched:now,expiresAt:now+300000}; states.set(token,state);
      return {status:200,payload:publicState(state),cookie:cookie(token,300)};
    }
    if (!enabled) throw new CoreError(503, 'Contrato de autenticação ainda não configurado');
    const csrf = request.headers['x-csrf-token'];
    if (!state || typeof csrf !== 'string' || Buffer.byteLength(csrf) !== Buffer.byteLength(state.csrf) || !timingSafeEqual(Buffer.from(csrf),Buffer.from(state.csrf))) throw new CoreError(403, 'Contexto de acesso expirado; atualize a página');
    if (path.endsWith('/user-logout')) {
      states.delete(id!); return {status:200,payload:{authenticated:false,configured:enabled},cookie:cookie('',0)};
    }
    if (now - windowStart >= 60000) { windowStart=now; attempts=0; }
    if (++attempts > 8) throw new CoreError(429, 'Aguarde antes de tentar novamente');
    const input = credentials(await readJson());
    if (state.busy) { input.senha=''; throw new CoreError(409, 'Uma validação já está em andamento'); }
    if (active >= 4) throw new CoreError(503, 'Serviço de autenticação ocupado');
    active++; state.busy=true;
    try {
      const result = await authenticateCore(baseUrl,input,correlationId);
      if (states.get(id!) !== state) throw new CoreError(403, 'Contexto de acesso encerrado; atualize a página');
      // Rotate only after explicit authenticated identity; no technical admin capabilities are granted.
      states.delete(id!);
      const token = randomBytes(32).toString('base64url');
      const seconds = Math.min(1800,result.expiresInSeconds);
      const next = {csrf:randomBytes(32).toString('base64url'),created:Date.now(),touched:Date.now(),expiresAt:Date.now()+seconds*1000,user:result.user,authorization:result.authorization,permissions:result.permissions,profiles:result.profiles}; states.set(token,next);
      return {status:200,payload:publicState(next),cookie:cookie(token,seconds)};
    } finally { input.senha=''; state.busy=false; active--; }
  };
  return Object.assign(handle,{sessionFor:(request:IncomingMessage)=>current(request).state,revoke:(request:IncomingMessage)=>{const {id}=current(request);if(id)states.delete(id);return cookie('',0);}});
}
