import { randomUUID } from 'node:crypto';

export class CoreError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.statusCode = statusCode; }
}

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const detail = new RegExp(`^/(usuarios|sistemas|perfis|permissoes|auditoria)/${uuid}$`);
const relation = new RegExp(`^/(usuarios/${uuid}/perfis|perfis/${uuid}/permissoes)(/${uuid})?$`);
const effective = new RegExp(`^/usuarios/${uuid}/permissoes-efetivas$`);

export function assertCoreRoute(method: string, path: string): void {
  if (method === 'DELETE' && /^\/sistemas\/[0-9a-fA-F-]{36}$/.test(path)) {
    throw new CoreError(501, 'DELETE de sistemas não habilitado até confirmação de semântica');
  }
  if (/^\/(portais|solicitacoes-cadastro|relatorios)(\/|$)/.test(path)) {
    throw new CoreError(501, 'Recurso não documentado no contrato da API Core');
  }
  const collection = /^\/(usuarios|sistemas|perfis|permissoes|auditoria)$/.test(path);
  const allowed = method === 'GET' && (collection || detail.test(path) || relation.test(path) || effective.test(path))
    || method === 'POST' && (/^\/(usuarios|sistemas|perfis|permissoes)$/.test(path) || relation.test(path) && path.split('/').length === 4)
    || ['PUT', 'DELETE'].includes(method) && detail.test(path) && !path.startsWith('/auditoria/')
    || method === 'DELETE' && relation.test(path) && path.split('/').length === 5;
  const byCode = /^\/sistemas\/codigo\/[A-Za-z0-9_-]{1,200}$/.test(path);
  if (!allowed && !(method === 'GET' && byCode)) throw new CoreError(404, 'Operação não disponível no contrato da API Core');
}

/** Only translate parameters declared by the delivered OpenAPI. Never drop a filter silently. */
export function coreQuery(path: string, input: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  const segments = path.slice(1).split('/');
  const resource = segments[0];
  if (segments.length > 1 && input.size) throw new CoreError(400, 'Filtros não permitidos nesta consulta');
  for (const [key, value] of input) {
    if (input.getAll(key).length !== 1 || value.length > 200) throw new CoreError(400, 'Parâmetro duplicado ou acima do limite');
    if (['page', 'pageSize'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (key === 'pageSize' ? 100 : 1_000_000))) throw new CoreError(400, 'Paginação inválida');
    if (resource === 'sistemas') {
      if (['page', 'pageSize', 'search'].includes(key)) continue;
      if (key === 'status' && ['ativo', 'inativo'].includes(value)) {
        if (result.has('apenasAtivos')) throw new CoreError(400, 'Filtros de sistemas conflitantes');
        result.set('apenasAtivos', value === 'ativo' ? 'true' : 'false');
      } else if (key === 'apenasAtivos' && ['true', 'false'].includes(value)) {
        if (result.has('apenasAtivos')) throw new CoreError(400, 'Filtros de sistemas conflitantes');
        result.set('apenasAtivos', value);
      }
      else throw new CoreError(400, `Filtro não suportado pela API: ${key}`);
    } else if (resource === 'usuarios' || resource === 'auditoria') {
      const name = ({ page: 'PageNumber', pageSize: 'PageSize', ...(resource === 'usuarios' ? { search: 'Busca', status: 'Status', perfilId: 'PerfilGuid' } : { atorUsuarioId: 'AtorUsuarioId', acao: 'Acao', entidade: 'Entidade', resultado: 'Resultado', status: 'Resultado', dataInicioUtc: 'DataInicioUtc', dataFimUtc: 'DataFimUtc', correlationId: 'CorrelationId' }) } as Record<string, string>)[key];
      if (!name) throw new CoreError(400, `Filtro não suportado pela API: ${key}`);
      if (result.has(name)) throw new CoreError(400, 'Filtros conflitantes');
      if (['perfilId', 'atorUsuarioId', 'correlationId'].includes(key) && !new RegExp(`^${uuid}$`).test(value)) throw new CoreError(400, 'Identificador de filtro inválido');
      if (['dataInicioUtc', 'dataFimUtc'].includes(key) && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) throw new CoreError(400, 'Data de filtro inválida');
      result.set(name, value);
    } else if (resource === 'perfis') {
      // These bounded collections are filtered and paginated locally by the BFF adapter.
      if (['page', 'pageSize', 'search'].includes(key)) continue;
      if (key === 'status' && ['ativo', 'inativo'].includes(value)) result.set('apenasAtivos', value === 'ativo' ? 'true' : 'false');
      else if (key === 'sistemaId' && new RegExp(`^${uuid}$`).test(value)) result.set('sistemaGuid', value);
      else throw new CoreError(400, `Filtro/paginação não documentado para ${resource}: ${key}`);
    } else if (resource === 'permissoes') {
      // These bounded collections are filtered and paginated locally by the BFF adapter.
      if (['page', 'pageSize', 'search'].includes(key)) continue;
      if (key === 'status' && ['ativo', 'inativo'].includes(value)) result.set('apenasAtivas', value === 'ativo' ? 'true' : 'false');
      else throw new CoreError(400, `Filtro/paginação não documentado para ${resource}: ${key}`);
    } else throw new CoreError(400, 'Consulta não permitida nesta operação');
  }
  if (resource === 'sistemas' && segments.length === 1 && !result.has('apenasAtivos')) result.set('apenasAtivos', 'false');
  return result;
}

export function coreDestination(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('ANI_CORE_BASE_URL deve conter apenas a origem, sem credenciais');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('ANI Core remoto exige HTTPS');
  return url;
}

export async function requestCorePasswordReset(baseUrl: string, email: string, correlationId = randomUUID()): Promise<{ mensagem: string; processadoEmUtc: string }> {
  const target = new URL('/api/v1/auth/reset-senha', coreDestination(baseUrl));
  const signal = AbortSignal.timeout(5000);
  try {
    const response = await fetch(target, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new CoreError(502, 'Recuperação temporariamente indisponível');
    }
    if (!/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel();
      throw new CoreError(502, 'Resposta inválida da recuperação de senha');
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (response.body) for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 16_384) throw new CoreError(502, 'Resposta da recuperação excede o limite');
      chunks.push(chunk);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CoreError(502, 'Resposta inválida da recuperação de senha');
    const result = payload as Record<string, unknown>;
    if (typeof result['mensagem'] !== 'string' || typeof result['processadoEmUtc'] !== 'string' || !Number.isFinite(Date.parse(result['processadoEmUtc']))) {
      throw new CoreError(502, 'Resposta inválida da recuperação de senha');
    }
    return {
      mensagem: 'Se as informações informadas corresponderem a uma conta ativa, você receberá um e-mail com as instruções e a senha temporária de acesso.',
      processadoEmUtc: result['processadoEmUtc'],
    };
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError(signal.aborted ? 504 : 502, 'Recuperação temporariamente indisponível');
  }
}

export async function changeCorePassword(
  baseUrl: string,
  authorization: string,
  input: { usuario: string; senhaAtual: string; novaSenha: string },
  correlationId = randomUUID(),
): Promise<void> {
  if (!authorization || /[\r\n]/.test(authorization)) throw new CoreError(401, 'Credencial do operador inválida');
  const signal = AbortSignal.timeout(5000);
  try {
    const response = await fetch(new URL('/api/v1/auth/trocar-senha', coreDestination(baseUrl)), {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Accept: '*/*', 'Content-Type': 'application/json', Authorization: authorization, 'X-Correlation-ID': correlationId },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
      throw new CoreError(status, status === 502 ? 'API ANI indisponível' : 'Troca de senha recusada pela API ANI');
    }
    await response.body?.cancel();
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError(signal.aborted ? 504 : 502, signal.aborted ? 'Tempo limite da API ANI excedido' : 'Falha de comunicação com a API ANI');
  }
}

/** Only the names of fields rejected by validation are exposed; upstream messages and values are discarded. */
async function rejectedFields(response: Response): Promise<string[]> {
  try {
    if (!/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); return []; }
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (response.body) for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 16_384) return [];
      chunks.push(chunk);
    }
    const errors = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { errors?: unknown })?.errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return [];
    return Object.keys(errors).filter(key => /^[A-Za-z][\w.]{0,49}$/.test(key)).slice(0, 10);
  } catch {
    return [];
  }
}

/** An anonymous Core does not establish the browser operator identity; the BFF must authorize it first. */
export async function callCore(baseUrl: string, method: string, path: string, query: URLSearchParams, authorization?: string, body?: Record<string, unknown>, correlationId = randomUUID()): Promise<{ status: number; payload?: unknown }> {
  assertCoreRoute(method, path);
  if (authorization !== undefined && (!authorization || /[\r\n]/.test(authorization))) throw new CoreError(401, 'Credencial do operador inválida');
  const target = new URL(`/api/v1${path}`, coreDestination(baseUrl));
  target.search = coreQuery(path, query).toString();
  const signal = AbortSignal.timeout(5000);
  try {
    const response = await fetch(target, {
      method, redirect: 'error', signal,
      headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}), 'X-Correlation-ID': correlationId, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Never relay arbitrary upstream errors or headers containing sensitive data.
    if (!response.ok) {
      const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
      const fields = status === 400 || status === 422 ? await rejectedFields(response) : (await response.body?.cancel(), []);
      throw new CoreError(status, status === 502 ? 'API ANI indisponível' : `Operação recusada pela API ANI${fields.length ? ` (campos: ${fields.join(', ')})` : ''}`);
    }
    if (response.status === 204) return { status: 204 };
    if (method !== 'GET') { await response.body?.cancel(); return { status: method === 'DELETE' ? 204 : response.status }; }
    if (!/^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel();
      throw new CoreError(502, 'Formato de resposta da API ANI inválido');
    }
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (response.body) for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 2_000_000) throw new CoreError(502, 'Resposta da API ANI excede o limite');
      chunks.push(chunk);
    }
    try { return { status: response.status, payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch { throw new CoreError(502, 'JSON da API ANI inválido'); }
  } catch (error) {
    if (error instanceof CoreError) throw error;
    throw new CoreError(signal.aborted ? 504 : 502, signal.aborted ? 'Tempo limite da API ANI excedido' : 'Falha de comunicação com a API ANI');
  }
}
