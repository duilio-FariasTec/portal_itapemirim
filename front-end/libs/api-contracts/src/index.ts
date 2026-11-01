/** Contract candidate aligned to docs; replace/generated from the API analyst's OpenAPI when available. */
export type AccessDecision = 'pending' | 'approved' | 'rejected';
export type AniResource = 'solicitacoes-cadastro' | 'usuarios' | 'sistemas' | 'perfis' | 'permissoes' | 'auditoria' | 'relatorios/acessos';

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sistemaId?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface UserInput { nome: string; email: string; login?: string; status?: 'ativo' | 'inativo' | 'pendente' }
export interface SistemaInput { codigo: string; nome: string; descricao?: string; status?: 'ativo' | 'inativo' }
export interface ProfileInput { nome: string; sistemaId: string; descricao?: string; status?: 'ativo' | 'inativo' }
export interface PermissionInput { nome: string; recurso: string; acao: string; escopo?: string; status?: 'ativo' | 'inativo' }
export interface EffectivePermissions { usuarioId: string; permissoes: AniPermission[] }
export interface AniPermission extends ApiRecord { id: string; nome: string; recurso: string; acao: string; escopo?: string; status?: string }
export interface AniSystem extends ApiRecord {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  status: 'ativo' | 'inativo';
}

export interface Solicitation {
  id: string;
  nome: string;
  email: string;
  sistemaNome: string;
  sistemaId: string;
  justificativa?: string;
  motivoDecisao?: string;
  status: AccessDecision;
  criadoEm: string;
}

export interface AniUser {
  id: string;
  nome: string;
  email: string;
  status: 'ativo' | 'inativo' | 'pendente';
  sistemas: string[];
}

export interface AniProfile {
  id: string;
  nome: string;
  sistemaNome: string;
  permissoes: string[];
}

export interface AuditEvent {
  id: string;
  ator: string;
  acao: string;
  recurso: string;
  resultado: 'sucesso' | 'negado';
  ocorridoEm: string;
}

export interface PagedResult<T> {
  dataMode?: 'mock' | 'api';
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSession {
  authenticated: boolean;
  authMode: 'mock' | 'oidc' | 'unconfigured' | 'integration' | 'core';
  loginUrl?: string;
  coreMode?: 'mock' | 'api';
  writesEnabled?: boolean;
  user?: { id: string; displayName: string; profileLabel: string };
  capabilities: string[];
  csrfToken?: string;
}

export type ApiRecord = Record<string, string | number | boolean | null | undefined>;
