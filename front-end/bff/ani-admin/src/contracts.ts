import { CoreError } from './core-client.ts';

type RecordValue = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoreError(502, 'Objeto inválido recebido da API');
  return value as RecordValue;
}
export function requestBody(path: string, method: string, value: RecordValue): RecordValue {
  if (method === 'DELETE') {
    if (Object.keys(value).length) throw new CoreError(400, 'DELETE não aceita campos');
    return {};
  }
  const resource = path.split('/')[1];
  let fields: string[];
  if (/^\/usuarios\/[^/]+\/perfis$/.test(path)) fields = ['perfilId'];
  else if (/^\/perfis\/[^/]+\/permissoes$/.test(path)) fields = ['permissaoId'];
  else if (resource === 'usuarios') fields = method === 'POST' ? ['nome', 'login', 'email', 'senha', 'status'] : ['nome', 'email', 'status'];
  else if (resource === 'sistemas') fields = ['codigo', 'nome', 'descricao', 'ativo', 'status'];
  else if (resource === 'perfis') fields = ['sistemaId', 'nome', 'descricao', 'ativo', 'status'];
  else fields = ['nome', 'descricao', 'recurso', 'acao', 'dscUrl', 'ativo', 'status', ...(method === 'POST' ? ['codigo'] : [])];
  if (Object.keys(value).some(key => !fields.includes(key))) throw new CoreError(422, 'Cadastro contém campos não suportados pelo Core; revise o contrato');
  const result: RecordValue = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'sistemaId' && entry === null && method === 'PUT') {
      result[key] = null; continue;
    }
    if (key === 'ativo') {
      if (typeof entry !== 'boolean') throw new CoreError(400, 'ativo deve ser booleano');
      result[key] = entry; continue;
    }
    if (typeof entry !== 'string' || entry.length > (key === 'descricao' ? 1000 : key === 'senha' ? 256 : 200)) throw new CoreError(400, 'Campo inválido ou acima do limite');
    const text = key === 'senha' ? entry : entry.trim();
    if (key.endsWith('Id') && !uuid.test(text)) throw new CoreError(400, 'Identificador inválido');
    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new CoreError(400, 'E-mail inválido');
    if (key === 'status' && !['ativo', 'inativo', ...(resource === 'usuarios' ? ['pendente'] : [])].includes(text)) throw new CoreError(400, 'Status inválido');
    if (key === 'status' && resource !== 'usuarios') {
      if ('ativo' in value) throw new CoreError(400, 'Não combine status e ativo');
      result['ativo'] = text === 'ativo';
    } else result[key] = text;
  }
  const required = fields.includes('perfilId') ? ['perfilId'] : fields.includes('permissaoId') ? ['permissaoId'] : ['nome', ...(resource === 'usuarios' ? ['email'] : resource === 'sistemas' ? ['codigo'] : resource === 'perfis' && method === 'POST' ? ['sistemaId'] : resource === 'permissoes' ? ['recurso', 'acao', ...(method === 'POST' ? ['codigo'] : [])] : [])];
  if (required.some(key => !result[key])) throw new CoreError(400, 'Preencha os campos obrigatórios');
  return result;
}

/** Business rule requested for administrative registration: first name in lowercase followed by 1234. */
export function initialPassword(nome: unknown): string {
  const first = typeof nome === 'string' ? nome.trim().split(/\s+/)[0] ?? '' : '';
  if (!first) throw new CoreError(400, 'Preencha os campos obrigatórios');
  return `${first.toLocaleLowerCase('pt-BR')}1234`;
}

/** Explicit projection: never forward password hashes, credentials or arbitrary Core properties. */
export function record(value: unknown): RecordValue {
  const source = object(value); const result: RecordValue = {};
  const fields = ['id', 'guid', 'nome', 'email', 'login', 'status', 'ativo', 'codigo', 'descricao', 'recurso', 'acao', 'dscUrl', 'escopo', 'sistemaId', 'sistemaGuid', 'sistemaNome', 'ator', 'atorUsuarioId', 'entidade', 'resultado', 'ocorridoEm', 'dataUtc', 'criadoEm', 'criadoEmUtc', 'atualizadoEmUtc', 'correlationId'];
  for (const key of fields) if (typeof source[key] === 'string' || typeof source[key] === 'boolean' || typeof source[key] === 'number' || source[key] === null) result[key] = source[key];
  if (!result['id'] && typeof source['guid'] === 'string') result['id'] = source['guid'];
  if (!result['sistemaId'] && typeof source['sistemaGuid'] === 'string') result['sistemaId'] = source['sistemaGuid'];
  if (!result['sistemaNome'] && source['sistema'] && typeof source['sistema'] === 'object' && !Array.isArray(source['sistema'])) {
    const system = source['sistema'] as RecordValue;
    if (typeof system['nome'] === 'string') result['sistemaNome'] = system['nome'];
  }
  if (!result['status'] && typeof source['ativo'] === 'boolean') result['status'] = source['ativo'] ? 'ativo' : 'inativo';
  if(typeof result['status']==='string'&&['ativo','inativo','pendente'].includes(result['status'].toLowerCase())) result['status']=result['status'].toLowerCase();
  if (!result['recurso'] && typeof source['entidade'] === 'string') result['recurso'] = source['entidade'];
  if (!result['ator'] && typeof source['atorUsuarioId'] === 'string') result['ator'] = source['atorUsuarioId'];
  if (!result['ocorridoEm'] && typeof source['dataUtc'] === 'string') result['ocorridoEm'] = source['dataUtc'];
  if (!Object.keys(result).length) throw new CoreError(502, 'Schema de resposta do Core não reconhecido');
  return result;
}
function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const source = object(value);
  if (Array.isArray(source['items'])) return source['items'];
  throw new CoreError(502, 'Coleção do Core não reconhecida; alinhe o schema de resposta');
}
export function responseBody(path: string, method: string, payload: unknown, query: URLSearchParams): unknown {
  if (method !== 'GET') return { ok: true }; // UI refreshes from authoritative GET after successful writes.
  if (path.startsWith('/sistemas/codigo/')) return record(payload);
  if (path.endsWith('/permissoes-efetivas')) {
    const values = Array.isArray(payload) ? payload : object(payload)['permissoes'];
    return { usuarioId: path.split('/')[2], permissoes: array(values).map(record) };
  }
  if (path.split('/').length === 4) return { items: array(payload).map(record) };
  if (path.split('/').length > 2) return record(payload);
  let rows = array(payload).map(record);
  const page = Number(query.get('page') ?? 1); const pageSize = Number(query.get('pageSize') ?? 25);
  if (['/perfis', '/permissoes', '/sistemas'].includes(path)) {
    const search = (query.get('search') ?? '').toLocaleLowerCase('pt-BR');
    const status = query.get('status');
    rows = rows.filter(row => (!search || [row['nome'], row['codigo'], row['descricao']].some(v => typeof v === 'string' && v.toLocaleLowerCase('pt-BR').includes(search))) && (!status || row['status'] === status));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }
  if (Array.isArray(payload)) throw new CoreError(502, 'Paginação do Core sem total; alinhe o contrato');
  const source = object(payload); const total = source['totalItems'] ?? source['total'] ?? source['totalCount'];
  if (!Number.isSafeInteger(total) || Number(total) < rows.length) throw new CoreError(502, 'Total de paginação do Core inválido');
  return { items: rows, total, page, pageSize };
}
