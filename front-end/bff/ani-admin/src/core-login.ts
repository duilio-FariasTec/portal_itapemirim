import { CoreError, coreDestination } from './core-client.ts';

export type LoginIdentity = { id: string; displayName: string };
export type CoreAuthentication = { user: LoginIdentity; authorization: string; expiresInSeconds: number; permissions: string[]; profiles: string[] };
/** Response contract supplied by the API analyst through the user; token stays server-side. */
export function loginIdentity(payload: unknown): CoreAuthentication {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CoreError(502, 'Contrato de autenticação incompatível');
  const data = payload as Record<string, unknown>;
  if (data['authenticated'] === false) throw new CoreError(401, 'Login ou senha inválidos');
  if (data['tokenType'] !== 'Bearer' || typeof data['token'] !== 'string' || data['token'].length < 32 || data['token'].length > 16384 || !/^[A-Za-z0-9._~+/-]+=*$/.test(data['token'])
    || !Number.isSafeInteger(data['expiresInSeconds']) || Number(data['expiresInSeconds']) < 1 || Number(data['expiresInSeconds']) > 86400
    || !data['usuario'] || typeof data['usuario'] !== 'object' || Array.isArray(data['usuario'])) throw new CoreError(502, 'Contrato de autenticação incompatível');
  const user = data['usuario'] as Record<string, unknown>;
  if (typeof user['id'] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user['id'])
    || typeof user['nome'] !== 'string' || !user['nome'].trim() || user['nome'].length > 120 || user['status'] !== 'Ativo') throw new CoreError(502, 'Identidade ausente, inativa ou inválida na resposta da API');
  const entries = user['permissoes'] ?? [];
  if (!Array.isArray(entries) || entries.length > 1000) throw new CoreError(502,'Permissões inválidas na resposta da API');
  const permissions = entries.map(value=>typeof value==='string'?value:value&&typeof value==='object'&&!Array.isArray(value)?value.codigo:undefined);
  if (permissions.some(value=>typeof value!=='string'||!value||value.length>100)) throw new CoreError(502,'Permissões inválidas na resposta da API');
  const profileEntries=user['perfis']??[];
  if(!Array.isArray(profileEntries)||profileEntries.length>100)throw new CoreError(502,'Perfis inválidos na resposta da API');
  const profiles=profileEntries.map(value=>typeof value==='string'?value:value&&typeof value==='object'&&!Array.isArray(value)?value.nome:undefined);
  if(profiles.some(value=>typeof value!=='string'||!value||value.length>120))throw new CoreError(502,'Perfis inválidos na resposta da API');
  return {user:{id:user['id'],displayName:user['nome'].trim()},authorization:`Bearer ${data['token']}`,expiresInSeconds:Number(data['expiresInSeconds']),permissions,profiles};
}
export function credentials(body: Record<string, unknown>): { login: string; senha: string } {
  if (Object.keys(body).length !== 2 || typeof body['login'] !== 'string' || typeof body['senha'] !== 'string'
    || !body['login'].trim() || body['login'].length > 200 || !body['senha'] || body['senha'].length > 256) throw new CoreError(400, 'Informe login e senha dentro dos limites');
  return { login: body['login'].trim(), senha: body['senha'] };
}
export async function authenticateCore(baseUrl: string, input: { login: string; senha: string }, correlationId: string): Promise<CoreAuthentication> {
  const signal = AbortSignal.timeout(5000);
  try {
    const response = await fetch(new URL('/api/v1/auth/login', coreDestination(baseUrl)), {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Correlation-ID': correlationId },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([400,401,403,422].includes(response.status)) throw new CoreError(401, 'Login ou senha inválidos');
      throw new CoreError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Aguarde antes de tentar novamente' : 'Serviço de autenticação indisponível');
    }
    if (!/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); throw new CoreError(502, 'Resposta de autenticação inválida'); }
    const parts: Buffer[] = []; let length = 0;
    if (response.body) for await (const part of response.body) {
      length += part.length;
      if (length > 65536) throw new CoreError(502, 'Resposta de autenticação acima do limite');
      parts.push(Buffer.from(part));
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new CoreError(502, 'Resposta de autenticação inválida'); }
    return loginIdentity(payload);
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError(signal.aborted ? 504 : 502, signal.aborted ? 'Tempo de autenticação excedido' : 'Serviço de autenticação indisponível');
  }
}
