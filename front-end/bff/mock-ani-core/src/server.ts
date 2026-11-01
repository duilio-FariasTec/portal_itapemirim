import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const port = Number(process.env.ANI_CORE_PORT ?? 3334);
type Row = Record<string, unknown> & { id: string };
const requests: Row[] = [
  { id: 'sol-1001', nome: 'Marina Alves (sintético)', email: 'marina.alves@example.invalid', sistemaNome: 'ANI Admin', sistemaId: 'ani-admin', status: 'pending', criadoEm: '2026-10-31T09:15:00-03:00', justificativa: 'Apoio à rotina administrativa.' },
  { id: 'sol-1002', nome: 'Rafael Lima (sintético)', email: 'rafael.lima@example.invalid', sistemaNome: 'Portal de Operações', sistemaId: 'portal-operacoes', status: 'pending', criadoEm: '2026-10-30T16:40:00-03:00', justificativa: 'Consulta de informações operacionais.' },
];
const permissions: Row[] = [
  { id: 'per-1', nome: 'Consultar usuários', recurso: 'usuarios', acao: 'ler', escopo: 'ANI Admin', status: 'ativo' },
  { id: 'per-2', nome: 'Manter usuários', recurso: 'usuarios', acao: 'manter', escopo: 'ANI Admin', status: 'ativo' },
  { id: 'per-3', nome: 'Decidir solicitações', recurso: 'solicitacoes', acao: 'decidir', escopo: 'ANI Admin', status: 'ativo' },
  { id: 'per-4', nome: 'Consultar auditoria', recurso: 'auditoria', acao: 'ler', escopo: 'ANI Admin', status: 'ativo' },
];
const systems: Row[] = [
  { id: 'sys-1', nome: 'ANI Admin', codigo: 'ani-admin', descricao: 'Console administrativo do Autorizador', status: 'ativo' },
  { id: 'sys-2', nome: 'Portal de Operações', codigo: 'portal-operacoes', descricao: 'Portal operacional', status: 'ativo' },
];
const profiles: Row[] = [
  { id: 'prf-1', nome: 'Administrador', sistemaId: 'sys-1', sistemaNome: 'ANI Admin', status: 'ativo', permissoes: ['per-1', 'per-2', 'per-3', 'per-4'] },
  { id: 'prf-2', nome: 'Consulta', sistemaId: 'sys-1', sistemaNome: 'ANI Admin', status: 'ativo', permissoes: ['per-1', 'per-4'] },
];
const users: Row[] = [
  { id: 'usr-101', nome: 'Marina Alves (sintético)', email: 'marina.alves@example.invalid', login: 'marina.demo', status: 'ativo', sistemas: ['ANI Admin'], perfilIds: ['prf-1'] },
  { id: 'usr-102', nome: 'Rafael Lima (sintético)', email: 'rafael.lima@example.invalid', login: 'rafael.demo', status: 'ativo', sistemas: ['Portal de Operações'], perfilIds: ['prf-2'] },
];
const audit: Row[] = [
  { id: 'evt-1', ator: 'admin-demo', acao: 'Consulta', recurso: 'usuários', resultado: 'sucesso', ocorridoEm: '2026-10-31T09:00:00-03:00' },
  { id: 'evt-2', ator: 'admin-demo', acao: 'Login', recurso: 'ANI Admin', resultado: 'sucesso', ocorridoEm: '2026-10-31T08:45:00-03:00' },
];

function respond(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) { const buffer = Buffer.from(chunk); length += buffer.length; if (length > 16_384) throw new Error('body too large'); chunks.push(buffer); }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object');
    return parsed as Record<string, unknown>;
  }
  catch { throw new Error('invalid json'); }
}
function rowsFor(resource: string): Row[] | undefined {
  switch (resource) {
    case 'usuarios': return users;
    case 'portais': return systems;
    case 'perfis': return profiles;
    case 'permissoes': return permissions;
    case 'auditoria': return audit;
    default: return undefined;
  }
}
function recordAudit(action: string, resource: string, id: string, result = 'sucesso', actor = 'operador.demo'): void {
  audit.unshift({ id: randomUUID(), ator: actor, acao: action, recurso: `${resource}/${id}`, resultado: result, ocorridoEm: new Date().toISOString() });
}
function page(rows: Row[], search: string, pageNumber: number, pageSize: number, status = ''): { items: Row[]; total: number; page: number; pageSize: number } {
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const byStatus = status ? rows.filter((row) => String(row['status'] ?? row['resultado'] ?? '') === status) : rows;
  const filtered = query ? byStatus.filter((row) => JSON.stringify(row).toLocaleLowerCase('pt-BR').includes(query)) : byStatus;
  const start = (pageNumber - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total: filtered.length, page: pageNumber, pageSize };
}
function notFound(res: ServerResponse, message: string): void { respond(res, 404, { title: message, status: 404 }); }

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const method = req.method ?? 'GET';
  if (method === 'GET' && url.pathname === '/health') return respond(res, 200, { status: 'ok', mode: 'synthetic-mock' });
  const match = url.pathname.match(/^\/api\/v1\/(.+)$/);
  if (!match) return notFound(res, 'Rota não encontrada');
  const path = match[1];
  const pageNumber = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25) || 25));
  const search = url.searchParams.get('search') ?? '';

  if (path === 'solicitacoes-cadastro' && method === 'GET') return respond(res, 200, page(requests, search, pageNumber, pageSize, url.searchParams.get('status') ?? ''));
  const requestDetail = path.match(/^solicitacoes-cadastro\/([a-zA-Z0-9-]+)$/);
  if (requestDetail && method === 'GET') {
    const item = requests.find((request) => request.id === requestDetail[1]);
    return item ? respond(res, 200, item) : notFound(res, 'Solicitação não encontrada');
  }
  if (path === 'solicitacoes-cadastro' && method === 'POST') {
    let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Solicitação inválida', status: 400 }); }
    const name = typeof data['nome'] === 'string' ? data['nome'].trim() : '';
    const email = typeof data['email'] === 'string' ? data['email'].trim() : '';
    const systemId = typeof data['sistemaId'] === 'string' ? data['sistemaId'].trim() : '';
    const justification = data['justificativa'] === undefined ? '' : typeof data['justificativa'] === 'string' ? data['justificativa'].trim() : null;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const allowedKeys = new Set(['nome', 'email', 'sistemaId', 'justificativa']);
    if ([...Object.keys(data)].some((key) => !allowedKeys.has(key))
      || !name || name.length > 120
      || !emailPattern.test(email) || email.length > 180
      || !systemId || systemId.length > 80
      || justification === null || justification.length > 500) {
      return respond(res, 400, { title: 'Informe nome, e-mail, sistema e justificativa dentro dos limites definidos', status: 400 });
    }
    const system = systems.find((item) => (item.id === systemId || item.codigo === systemId) && item.status === 'ativo');
    if (!system) return respond(res, 400, { title: 'Selecione um sistema ativo do catálogo', status: 400 });
    const item: Row = { id: `sol-${randomUUID()}`, nome: name, email, sistemaId: system.id, sistemaNome: String(system.nome), status: 'pending', criadoEm: new Date().toISOString(), justificativa: justification ?? '' };
    requests.unshift(item);
    recordAudit('solicitar-acesso', 'solicitacoes-cadastro', item.id, 'sucesso', 'solicitante-anonimo');
    return respond(res, 201, item);
  }
  const decision = path.match(/^solicitacoes-cadastro\/([a-zA-Z0-9-]+)\/(aprovar|rejeitar)$/);
  if (decision && method === 'POST') {
    const item = requests.find((request) => request.id === decision[1]);
    if (!item) return notFound(res, 'Solicitação não encontrada');
    if (item.status !== 'pending') return respond(res, 409, { title: 'Solicitação já decidida', status: 409 });
    if (decision[2] === 'rejeitar') {
      let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Motivo inválido', status: 400 }); }
      const reason = data['justificativa'] === undefined ? '' : typeof data['justificativa'] === 'string' ? data['justificativa'].trim() : null;
      if (reason === null || reason.length > 500 || Object.keys(data).some((key) => key !== 'justificativa')) return respond(res, 400, { title: 'A justificativa deve ter até 500 caracteres', status: 400 });
      item['motivoDecisao'] = reason;
    }
    item.status = decision[2] === 'aprovar' ? 'approved' : 'rejected';
    recordAudit(decision[2], 'solicitacoes-cadastro', item.id);
    return respond(res, 200, item);
  }
  const effective = path.match(/^usuarios\/([a-zA-Z0-9-]+)\/permissoes-efetivas$/);
  if (effective && method === 'GET') {
    const user = users.find((item) => item.id === effective[1]); if (!user) return notFound(res, 'Usuário não encontrado');
    const assigned = profiles.filter((profile) => (user.perfilIds as string[]).includes(profile.id) && profile.status === 'ativo');
    const ids = [...new Set(assigned.flatMap((profile) => profile.permissoes as string[]))];
    return respond(res, 200, { usuarioId: user.id, permissoes: permissions.filter((permission) => ids.includes(permission.id) && permission.status === 'ativo') });
  }
  const userProfiles = path.match(/^usuarios\/([a-zA-Z0-9-]+)\/perfis(?:\/([a-zA-Z0-9-]+))?$/);
  if (userProfiles) {
    const user = users.find((item) => item.id === userProfiles[1]); if (!user) return notFound(res, 'Usuário não encontrado');
    const profileIds = user.perfilIds as string[];
    if (method === 'GET' && !userProfiles[2]) return respond(res, 200, { items: profiles.filter((profile) => profileIds.includes(profile.id)) });
    if (method === 'POST' && !userProfiles[2]) {
      let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Atribuição inválida', status: 400 }); }
      const profileId = String(data['perfilId'] ?? ''); const profile = profiles.find((item) => item.id === profileId && item.status === 'ativo');
      if (!profile) return respond(res, 400, { title: 'Perfil ativo não encontrado', status: 400 });
      if (!profileIds.includes(profileId)) profileIds.push(profileId);
      const systemName = String(profile['sistemaNome'] ?? ''); const userSystems = user['sistemas'] as string[];
      if (systemName && !userSystems.includes(systemName)) userSystems.push(systemName);
      recordAudit('atribuir-perfil', 'usuarios', user.id); return respond(res, 201, { usuarioId: user.id, perfil: profile });
    }
    if (method === 'DELETE' && userProfiles[2]) {
      user.perfilIds = profileIds.filter((id) => id !== userProfiles[2]);
      const remainingSystems = profiles.filter((profile) => (user.perfilIds as string[]).includes(profile.id)).map((profile) => String(profile['sistemaNome'] ?? ''));
      user['sistemas'] = [...new Set(remainingSystems)];
      recordAudit('revogar-perfil', 'usuarios', user.id); return respond(res, 204, null);
    }
  }
  const profilePermissions = path.match(/^perfis\/([a-zA-Z0-9-]+)\/permissoes(?:\/([a-zA-Z0-9-]+))?$/);
  if (profilePermissions) {
    const profile = profiles.find((item) => item.id === profilePermissions[1]); if (!profile) return notFound(res, 'Perfil não encontrado');
    const ids = profile.permissoes as string[];
    if (method === 'GET' && !profilePermissions[2]) return respond(res, 200, { items: permissions.filter((permission) => ids.includes(permission.id)) });
    if (method === 'POST' && !profilePermissions[2]) {
      let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Associação inválida', status: 400 }); }
      const permissionId = String(data['permissaoId'] ?? ''); const permission = permissions.find((item) => item.id === permissionId && item.status === 'ativo');
      if (!permission) return respond(res, 400, { title: 'Permissão ativa não encontrada', status: 400 });
      if (!ids.includes(permissionId)) ids.push(permissionId); recordAudit('associar-permissao', 'perfis', profile.id); return respond(res, 201, { perfilId: profile.id, permissao: permission });
    }
    if (method === 'DELETE' && profilePermissions[2]) {
      profile.permissoes = ids.filter((id) => id !== profilePermissions[2]); recordAudit('revogar-permissao', 'perfis', profile.id); return respond(res, 204, null);
    }
  }
  const matchResource = path.match(/^(usuarios|portais|perfis|permissoes|auditoria|relatorios\/acessos)(?:\/([a-zA-Z0-9-]+))?$/);
  if (!matchResource) return notFound(res, 'Rota não implementada no mock');
  const resource = matchResource[1]; const id = matchResource[2];
  if (resource === 'relatorios/acessos') {
    if (method !== 'GET') return respond(res, 405, { title: 'Operação não permitida', status: 405 });
    const items = systems.map((system) => ({ sistemaId: system.id, sistema: system.nome, usuariosAtivos: users.filter((user) => user.status === 'ativo' && (user.sistemas as string[]).includes(String(system.nome))).length, perfisAtivos: profiles.filter((profile) => profile.status === 'ativo' && profile.sistemaId === system.id).length }));
    return respond(res, 200, page(items as Row[], search, pageNumber, pageSize, url.searchParams.get('status') ?? ''));
  }
  const collection = rowsFor(resource); if (!collection) return notFound(res, 'Recurso não encontrado');
  if (!id) {
    if (method === 'GET') return respond(res, 200, page(collection, search, pageNumber, pageSize, url.searchParams.get('status') ?? ''));
    if (method === 'POST' && ['usuarios', 'portais', 'perfis', 'permissoes'].includes(resource)) {
      let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Dados inválidos', status: 400 }); }
      const required = resource === 'usuarios' ? ['nome', 'email'] : resource === 'portais' ? ['nome', 'codigo'] : resource === 'perfis' ? ['nome', 'sistemaId'] : ['nome', 'recurso', 'acao'];
      if (required.some((key) => typeof data[key] !== 'string' || !String(data[key]).trim())) return respond(res, 400, { title: 'Preencha os campos obrigatórios', status: 400 });
      const newRow: Row = { id: `${resource.slice(0, 3)}-${randomUUID()}`, ...data, status: 'ativo' };
      if (resource === 'usuarios') { newRow.perfilIds = []; newRow.sistemas = []; }
      if (resource === 'perfis') { newRow.permissoes = []; newRow.sistemaNome = systems.find((system) => system.id === data['sistemaId'])?.nome ?? ''; }
      collection.unshift(newRow); recordAudit('incluir', resource, newRow.id); return respond(res, 201, newRow);
    }
    return respond(res, 405, { title: 'Operação não permitida', status: 405 });
  }
  const row = collection.find((item) => item.id === id); if (!row) return notFound(res, 'Registro não encontrado');
  if (method === 'GET') {
    if (resource === 'usuarios') return respond(res, 200, { ...row, perfis: profiles.filter((profile) => (row.perfilIds as string[]).includes(profile.id)) });
    return respond(res, 200, row);
  }
  if (method === 'PUT' && !['auditoria', 'relatorios/acessos'].includes(resource)) {
    let data: Record<string, unknown>; try { data = await body(req); } catch { return respond(res, 400, { title: 'Dados inválidos', status: 400 }); }
    Object.assign(row, data, { id: row.id });
    if (resource === 'perfis' && typeof data['sistemaId'] === 'string') row['sistemaNome'] = systems.find((system) => system.id === data['sistemaId'])?.nome ?? '';
    recordAudit('alterar', resource, id); return respond(res, 200, row);
  }
  if (method === 'DELETE' && ['usuarios', 'portais', 'perfis', 'permissoes'].includes(resource)) {
    row.status = 'inativo'; recordAudit('inativar', resource, id); return respond(res, 204, null);
  }
  respond(res, 405, { title: 'Operação não permitida', status: 405 });
});

if ((process.env.NODE_ENV ?? 'development') !== 'development' || !['127.0.0.1', 'localhost'].includes(process.env.ANI_CORE_BIND ?? '127.0.0.1')) throw new Error('Mock Core só pode iniciar em desenvolvimento local.');
server.listen(port, '127.0.0.1', () => console.log(`ANI mock Core disponível em http://127.0.0.1:${port}/health`));
