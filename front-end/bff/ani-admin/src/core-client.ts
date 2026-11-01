import { randomUUID } from 'node:crypto';

export class CoreError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.statusCode = statusCode; }
}

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const detail = new RegExp(`^/(usuarios|perfis|permissoes|auditoria)/${uuid}$`);
const relation = new RegExp(`^/(usuarios/${uuid}/perfis|perfis/${uuid}/permissoes)(/${uuid})?$`);
const effective = new RegExp(`^/usuarios/${uuid}/permissoes-efetivas$`);

export function assertCoreRoute(method: string, path: string): void {
  if (/^\/(portais|solicitacoes-cadastro|relatorios)(\/|$)/.test(path)) {
    throw new CoreError(501, 'Recurso não documentado no contrato da API Core');
  }
  const collection = /^\/(usuarios|perfis|permissoes|auditoria)$/.test(path);
  const allowed = method === 'GET' && (collection || detail.test(path) || relation.test(path) || effective.test(path))
    || method === 'POST' && (/^\/(usuarios|perfis|permissoes)$/.test(path) || relation.test(path) && path.split('/').length === 4)
    || ['PUT', 'DELETE'].includes(method) && detail.test(path) && !path.startsWith('/auditoria/')
    || method === 'DELETE' && relation.test(path) && path.split('/').length === 5;
  if (!allowed) throw new CoreError(404, 'Operação não disponível no contrato da API Core');
}

/** Only translate parameters declared by the delivered OpenAPI. Never drop a filter silently. */
export function coreQuery(path: string, input: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  const resource = path.slice(1);
  for (const [key, value] of input) {
    if (input.getAll(key).length !== 1 || value.length > 200) throw new CoreError(400, 'Parâmetro duplicado ou acima do limite');
    if (['page', 'pageSize'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (key === 'pageSize' ? 100 : 1_000_000))) throw new CoreError(400, 'Paginação inválida');
    if (resource === 'usuarios' || resource === 'auditoria') {
      const name = ({ page: 'PageNumber', pageSize: 'PageSize', ...(resource === 'usuarios' ? { search: 'Busca', status: 'Status', perfilId: 'PerfilGuid' } : { atorUsuarioId: 'AtorUsuarioId', acao: 'Acao', entidade: 'Entidade', resultado: 'Resultado', dataInicioUtc: 'DataInicioUtc', dataFimUtc: 'DataFimUtc', correlationId: 'CorrelationId' }) } as Record<string, string>)[key];
      if (!name) throw new CoreError(400, `Filtro não suportado pela API: ${key}`);
      if (['perfilId', 'atorUsuarioId', 'correlationId'].includes(key) && !new RegExp(`^${uuid}$`).test(value)) throw new CoreError(400, 'Identificador de filtro inválido');
      if (['dataInicioUtc', 'dataFimUtc'].includes(key) && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) throw new CoreError(400, 'Data de filtro inválida');
      result.set(name, value);
    } else if (resource === 'perfis' || resource === 'permissoes') {
      // These bounded collections are filtered and paginated locally by the BFF adapter.
      if (['page', 'pageSize', 'search'].includes(key)) continue;
      if (key === 'status' && value === 'ativo') result.set(resource === 'perfis' ? 'apenasAtivos' : 'apenasAtivas', 'true');
      else if (key === 'status' && value === 'inativo') continue;
      else throw new CoreError(400, `Filtro/paginação não documentado para ${resource}: ${key}`);
    } else throw new CoreError(400, 'Consulta não permitida nesta operação');
  }
  return result;
}

export function coreDestination(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('ANI_CORE_BASE_URL deve conter apenas a origem, sem credenciais');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('ANI Core remoto exige HTTPS');
  return url;
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
      await response.body?.cancel();
      const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
      throw new CoreError(status, status === 502 ? 'API ANI indisponível' : 'Operação recusada pela API ANI');
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
