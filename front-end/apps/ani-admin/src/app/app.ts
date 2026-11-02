import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { AdminSession, AniResource, ApiRecord, EffectivePermissions, PagedResult } from '../../../../libs/api-contracts/src';
import { AdminApiService, MaintainedResource } from './core/api/admin-api.service';
import { CsrfTokenStore } from './core/auth/csrf-token.store';
import { MeuPerfilComponent } from './features/meu-perfil/meu-perfil.component';
import { MY_ACCOUNT_API, MyAccountApi } from './features/meu-perfil/my-account';

type Section = 'visao-geral' | 'meu-perfil' | AniResource;
type DataSection = Exclude<Section, 'visao-geral' | 'meu-perfil'>;
type EditorState = { resource: MaintainedResource; id?: string; values: Record<string, string> };
type Field = { key: string; label: string; required?: boolean; type?: 'text' | 'email' | 'system' | 'status'; hint?: string };
const navigation: { id: Section; label: string; group: string }[] = [
  { id: 'visao-geral', label: 'Visão geral', group: 'Início' },
  { id: 'meu-perfil', label: 'Meu Perfil', group: 'Início' },
  { id: 'solicitacoes-cadastro', label: 'Solicitações de acesso', group: 'Operação' },
  { id: 'usuarios', label: 'Usuários', group: 'Operação' },
  { id: 'sistemas', label: 'Sistemas', group: 'Configuração' },
  { id: 'perfis', label: 'Perfis', group: 'Configuração' },
  { id: 'permissoes', label: 'Permissões', group: 'Configuração' },
  { id: 'auditoria', label: 'Auditoria', group: 'Governança' },
  { id: 'relatorios/acessos', label: 'Relatórios de acesso', group: 'Governança' },
];
const fields: Record<MaintainedResource, Field[]> = {
  usuarios: [
    { key: 'nome', label: 'Nome completo', required: true, hint: 'Nome que será exibido nas consultas e auditorias. No cadastro, a senha inicial será o primeiro nome em minúsculas seguido de 1234.' },
    { key: 'email', label: 'E-mail', type: 'email', required: true },
    { key: 'login', label: 'Login', hint: 'Use o padrão nome.sobrenome (ex.: maria.silva). A API ANI recusa e-mail como login.' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
  sistemas: [
    { key: 'nome', label: 'Nome do sistema', required: true },
    { key: 'codigo', label: 'Código', required: true, hint: 'Identificador estável usado nas integrações.' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
  perfis: [
    { key: 'nome', label: 'Nome do perfil', required: true },
    { key: 'sistemaId', label: 'Sistema', type: 'system', required: true },
    { key: 'descricao', label: 'Descrição' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
  permissoes: [
    { key: 'nome', label: 'Nome da permissão', required: true },
    { key: 'recurso', label: 'Recurso', required: true, hint: 'Ex.: usuarios, solicitacoes ou auditoria.' },
    { key: 'acao', label: 'Ação', required: true, hint: 'Ex.: ler, criar, alterar ou revogar.' },
    { key: 'escopo', label: 'Escopo' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
};
const columns: Record<DataSection, string[]> = {
  'solicitacoes-cadastro': ['nome', 'email', 'sistemaNome', 'status', 'criadoEm'],
  usuarios: ['nome', 'email', 'login', 'status'],
  sistemas: ['nome', 'codigo', 'descricao', 'status'],
  perfis: ['nome', 'sistemaNome', 'status'],
  permissoes: ['nome', 'recurso', 'acao', 'escopo', 'status'],
  auditoria: ['ator', 'acao', 'recurso', 'resultado', 'ocorridoEm'],
  'relatorios/acessos': ['sistema', 'usuariosAtivos', 'perfisAtivos'],
};

@Component({
  imports: [FormsModule, MeuPerfilComponent], selector: 'ani-admin-root', styleUrl: './app.scss', templateUrl: './app.html',
  providers: [{ provide: MY_ACCOUNT_API, useFactory: (): MyAccountApi => {
    const api = inject(AdminApiService);
    return { profile: () => api.myProfile(), access: () => api.myAccess(), changePassword: (body) => api.changePassword(body) };
  } }],
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(AdminApiService);
  private readonly csrfToken = inject(CsrfTokenStore);
  protected readonly session = signal<AdminSession | null>(null);
  protected readonly section = signal<Section>('visao-geral');
  protected readonly mobileNavOpen = signal(false);
  protected readonly rows = signal<ApiRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly listFailed = signal(false);
  protected readonly listIsMock = signal(false);
  protected readonly saving = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly pendingOperation = signal<string | null>(null);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly actor = signal<'admin' | 'consulta'>('admin');
  protected readonly navigation = navigation;
  protected readonly demoMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  protected readonly pendingCount = signal(0);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly searchInput = signal('');
  protected readonly statusInput = signal('');
  protected readonly systemInput = signal('');
  protected readonly appliedSearch = signal('');
  protected readonly appliedStatus = signal('');
  protected readonly appliedSystem = signal('');
  protected readonly editor = signal<EditorState | null>(null);
  protected readonly editorError = signal('');
  protected readonly fields = fields;
  protected readonly systems = signal<ApiRecord[]>([]);
  protected readonly systemsLoading = signal(false);
  protected readonly systemsError = signal('');
  protected readonly detail = signal<{ resource: Section; record: ApiRecord } | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly userProfiles = signal<ApiRecord[]>([]);
  protected readonly userPermissions = signal<ApiRecord[]>([]);
  protected readonly availableProfiles = signal<ApiRecord[]>([]);
  protected readonly selectedProfileId = signal('');
  protected readonly profilePermissions = signal<ApiRecord[]>([]);
  protected readonly availablePermissions = signal<ApiRecord[]>([]);
  protected readonly selectedPermissionId = signal('');
  protected readonly pendingDeactivate = signal<{ resource: MaintainedResource; id: string; label: string } | null>(null);
  protected readonly decisionDialog = signal<{ id: string; decision: 'aprovar' | 'rejeitar' } | null>(null);
  protected readonly decisionReason = signal('');
  private modalReturnFocus: HTMLElement | null = null;
  protected readonly reportExporting = signal(false);

  ngOnInit(): void { this.refreshSession(); }
  protected get title(): string { return navigation.find((item) => item.id === this.section())?.label ?? 'Visão geral'; }
  protected get allowed(): boolean { return this.section() === 'meu-perfil' || (this.session()?.capabilities.includes(this.capabilityFor(this.section())) ?? false); }
  protected get canManageCurrent(): boolean { return ['usuarios', 'sistemas', 'perfis', 'permissoes'].includes(this.section()) && (this.session()?.capabilities.includes(this.section() === 'usuarios' ? 'users.write' : 'catalog.write') ?? false); }
  protected get canDeactivateCurrent(): boolean { return this.canManageCurrent && !(this.section() === 'sistemas' && this.session()?.coreMode === 'api'); }
  protected get pageCount(): number { return Math.max(1, Math.ceil(this.total() / this.pageSize)); }
  protected get isReadOnly(): boolean { return this.section() === 'auditoria' || this.section() === 'relatorios/acessos'; }

  protected toggleMobileNavigation(): void {
    if (this.mobileNavOpen()) { this.closeMobileNavigation(); return; }
    this.mobileNavOpen.set(true);
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>('.sidebar .nav-item')?.focus()));
  }
  protected closeMobileNavigation(returnFocus = true): void {
    this.mobileNavOpen.set(false);
    if (returnFocus) requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>('.mobile-nav-toggle')?.focus()));
  }
  protected handleMobileNavigationKeydown(event: KeyboardEvent): void {
    if (!this.mobileNavOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMobileNavigation();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...document.querySelectorAll<HTMLElement>('.sidebar .brand-mark, .sidebar .nav-item, .sidebar .sidebar-close')];
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  protected refreshSession(): void {
    this.http.get<AdminSession>('/bff/session', { withCredentials: true }).subscribe({
      next: (value) => { this.session.set(value); this.csrfToken.set(value.csrfToken); if (value.authenticated) { this.refreshPendingCount(); this.loadSection(); } else if(value.authMode==='core') this.goToLogin(); },
      error: () => this.message.set('BFF local indisponível. Inicie os serviços locais para continuar.'),
    });
  }
  protected signIn(): void {
    this.http.post<AdminSession>('/bff/dev/auth/login', { actor: this.actor() }, { withCredentials: true }).subscribe({
      next: (value) => { this.session.set(value); this.csrfToken.set(value.csrfToken); this.message.set('Sessão local de demonstração iniciada.'); this.refreshPendingCount(); this.loadSection(); },
      error: (error: HttpErrorResponse) => this.showError(error, 'Não foi possível iniciar a demonstração.'),
    });
  }
  protected goToLogin(): void {
    const raw = this.session()?.loginUrl ?? 'http://127.0.0.1:4201/';
    if (raw.startsWith('/') && !raw.startsWith('//') && !/[?#\s]/.test(raw)) { window.location.assign(raw); return; }
    const target = new URL(raw, window.location.origin);
    const sameOriginHttps = target.origin === window.location.origin && target.protocol === 'https:';
    const localLoopback = ['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost'].includes(target.hostname);
    if ((!sameOriginHttps && !localLoopback) || !['/', '/login', '/login/'].includes(target.pathname) || target.search || target.hash) { this.error.set('Destino de acesso inválido.'); return; }
    window.location.assign(target.href);
  }
  protected canNavigate(section:Section):boolean {return section==='visao-geral'||section==='meu-perfil'||Boolean(this.session()?.capabilities.includes(this.capabilityFor(section)));}
  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      // Refresh the session/CSRF token first so stale browser state does not strand the operator on a dead session.
      const current = await firstValueFrom(this.http.get<AdminSession>('/bff/session', { withCredentials: true }));
      if (!current.authenticated) {
        this.clearLocalSession('A sessão já estava encerrada.');
        return;
      }
      this.csrfToken.set(current.csrfToken);
      await firstValueFrom(this.http.post('/bff/auth/logout', {}, { withCredentials: true }));
      this.clearLocalSession('Sessão encerrada.');
    } catch (failure) {
      const error = failure instanceof HttpErrorResponse ? failure : new HttpErrorResponse({ error: failure });
      if (error.status === 401 || error.status === 403) {
        this.clearLocalSession('Sua sessão expirou ou foi invalidada. Entre novamente para continuar.');
      } else {
        this.showError(error, 'Não foi possível confirmar o encerramento da sessão. Tente novamente.');
      }
    } finally {
      this.signingOut.set(false);
    }
  }
  protected select(id: Section): void {
    this.closeMobileNavigation();
    this.section.set(id); this.page.set(1); this.appliedSearch.set(''); this.appliedStatus.set(''); this.appliedSystem.set(''); this.searchInput.set(''); this.statusInput.set(''); this.systemInput.set(''); this.message.set(''); this.error.set('');
    if (id === 'perfis') this.loadSystems();
    this.loadSection();
  }
  protected applyFilters(): void { this.page.set(1); this.appliedSearch.set(this.searchInput().trim()); this.appliedStatus.set(this.statusInput()); this.appliedSystem.set(this.systemInput()); this.loadSection(); }
  protected clearFilters(): void { this.searchInput.set(''); this.statusInput.set(''); this.systemInput.set(''); this.appliedSearch.set(''); this.appliedStatus.set(''); this.appliedSystem.set(''); this.page.set(1); this.loadSection(); }
  protected changePage(delta: number): void { const next = this.page() + delta; if (next >= 1 && next <= this.pageCount) { this.page.set(next); this.loadSection(); } }
  protected loadSection(): void {
    this.listFailed.set(false);
    this.listIsMock.set(false);
    if (this.section() === 'visao-geral') { this.rows.set([]); this.error.set(''); return; }
    if (this.section() === 'meu-perfil') { this.rows.set([]); this.total.set(0); this.error.set(''); return; }
    this.loading.set(true); this.error.set('');
    this.api.list(this.section() as AniResource, { page: this.page(), pageSize: this.pageSize, search: this.appliedSearch(), status: this.appliedStatus() || undefined, sistemaId: this.section() === 'perfis' ? this.appliedSystem() || undefined : undefined }).subscribe({
      next: (result: PagedResult<ApiRecord>) => {
        this.listIsMock.set(result.dataMode==='mock');
        const items = result.items ?? []; this.rows.set(items); this.total.set(result.total ?? items.length);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => { this.rows.set([]); this.total.set(0); this.loading.set(false); this.listFailed.set(true); this.showError(error, 'Não foi possível carregar os dados.'); },
    });
  }
  protected visibleColumns(): string[] { return columns[this.section() as DataSection] ?? []; }
  protected formatKey(key: string): string {
    const labels: Record<string, string> = { nome: 'Nome', email: 'E-mail', login: 'Login', sistemaNome: 'Sistema', status: 'Status', criadoEm: 'Criada em', codigo: 'Código', descricao: 'Descrição', recurso: 'Recurso', acao: 'Ação', escopo: 'Escopo', ator: 'Ator', resultado: 'Resultado', ocorridoEm: 'Data e hora', sistema: 'Sistema', usuariosAtivos: 'Usuários ativos', perfisAtivos: 'Perfis ativos' };
    return labels[key] ?? key;
  }
  protected value(value: unknown, key = ''): string {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if ((key === 'criadoEm' || key === 'ocorridoEm') && typeof value === 'string') {
      const date = new Date(value); if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    }
    return String(value);
  }
  protected rowId(row: ApiRecord): string { return String(row['id'] ?? ''); }
  protected rowLabel(row: ApiRecord): string { return String(row['nome'] ?? row['codigo'] ?? row['id'] ?? 'registro'); }
  protected createRecord(): void {
    if (!this.canManageCurrent || !this.isMaintainedResource(this.section())) return;
    const resource = this.section() as MaintainedResource;
    const values: Record<string, string> = {};
    for (const field of this.resourceFields(resource, false)) values[field.key] = field.key === 'status' ? 'ativo' : '';
    this.editor.set({ resource, values }); this.editorError.set('');
    this.prepareModal();
    if (resource === 'perfis' && !this.systems().length && !this.systemsLoading()) this.loadSystems();
  }
  protected editRecord(row: ApiRecord): void {
    if (!this.canManageCurrent || !this.isMaintainedResource(this.section())) return;
    const resource = this.section() as MaintainedResource; const values: Record<string, string> = {};
    for (const field of this.resourceFields(resource, true)) values[field.key] = String(row[field.key] ?? '');
    this.editor.set({ resource, id: this.rowId(row), values }); this.editorError.set('');
    this.prepareModal();
    if (resource === 'perfis' && !this.systems().length && !this.systemsLoading()) this.loadSystems();
  }
  protected closeEditor(): void { if (!this.saving()) { this.editor.set(null); this.restoreModalFocus(); } }
  protected setEditorValue(key: string, value: string): void {
    const current = this.editor(); if (!current) return;
    this.editor.set({ ...current, values: { ...current.values, [key]: value } }); this.editorError.set('');
  }
  private resourceFields(resource: MaintainedResource, editing: boolean): Field[] {
    if (this.session()?.coreMode !== 'api') return fields[resource];
    const base = fields[resource].filter(field => field.key !== 'escopo' && !(resource === 'usuarios' && editing && field.key === 'login'));
    if (resource === 'permissoes') return [...(!editing ? [{ key: 'codigo', label: 'Código', required: true }] : []), ...base, { key: 'descricao', label: 'Descrição' }, { key: 'dscUrl', label: 'URL do recurso' }];
    return base;
  }
  protected fieldsForEditor(): Field[] { const state = this.editor(); return state ? this.resourceFields(state.resource, Boolean(state.id)) : []; }
  protected saveRecord(): void {
    const state = this.editor(); if (!state || this.saving()) return;
    const missing = this.fieldsForEditor().find((field) => field.required && !state.values[field.key]?.trim());
    if (missing) { this.editorError.set(`Preencha o campo ${missing.label.toLocaleLowerCase('pt-BR')}.`); return; }
    if (state.resource === 'usuarios' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.values['email'] ?? '')) { this.editorError.set('Informe um e-mail válido.'); return; }
    this.saving.set(true);
    const payload = Object.fromEntries(Object.entries(state.values).map(([key, value]) => [key, value.trim()]));
    const operation = state.id ? this.api.update(state.resource, state.id, payload) : this.api.create(state.resource, payload);
    operation.subscribe({
      next: () => { this.saving.set(false); this.editor.set(null); this.restoreModalFocus(); this.message.set(state.id ? 'Alterações salvas.' : state.resource === 'usuarios' && this.session()?.coreMode === 'api' ? 'Cadastro criado. Senha inicial: primeiro nome em minúsculas + 1234. Oriente a troca em Meu Perfil.' : 'Cadastro criado.'); this.loadSection(); },
      error: (error: HttpErrorResponse) => { this.saving.set(false); this.editorError.set(this.errorMessage(error, 'Não foi possível salvar o cadastro.')); },
    });
  }
  protected requestDeactivate(row: ApiRecord): void {
    if (this.session()?.coreMode === 'api') { this.error.set('A inativação depende da confirmação da semântica DELETE do Core. Operação indisponível nesta tela.'); return; }
    if (!this.canManageCurrent || !this.isMaintainedResource(this.section())) return;
    this.pendingDeactivate.set({ resource: this.section() as MaintainedResource, id: this.rowId(row), label: this.rowLabel(row) });
    this.prepareModal();
  }
  protected closeDeactivation(): void { if (!this.pendingOperation()) { this.pendingDeactivate.set(null); this.restoreModalFocus(); } }
  protected openDecision(id: string, decision: 'aprovar' | 'rejeitar'): void {
    this.decisionReason.set('');
    this.decisionDialog.set({ id, decision });
    this.prepareModal();
  }
  protected closeDecision(): void { if (!this.pendingOperation()) { this.decisionDialog.set(null); this.restoreModalFocus(); } }
  protected confirmDecision(): void {
    const pending = this.decisionDialog();
    if (!pending || this.pendingOperation()) return;
    const reason = this.decisionReason().trim();
    if (reason.length > 500) { this.error.set('A justificativa deve ter até 500 caracteres.'); return; }
    this.pendingOperation.set('decision');
    const operation = pending.decision === 'aprovar' ? this.api.approve(pending.id) : this.api.reject(pending.id, reason);
    operation.subscribe({
      next: () => {
        this.pendingOperation.set(null); this.decisionDialog.set(null); this.restoreModalFocus();
        this.message.set(pending.decision === 'aprovar'
          ? 'Decisão registrada no mock. O status foi atualizado; o mock não provisiona usuário nem concede perfil.'
          : 'Rejeição registrada no mock.');
        this.refreshPendingCount(); this.loadSection();
      },
      error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.showError(error, 'A decisão não foi concluída.'); },
    });
  }
  protected confirmDeactivate(): void {
    const pending = this.pendingDeactivate(); if (!pending || this.pendingOperation()) return;
    this.pendingOperation.set('deactivate');
    this.api.deactivate(pending.resource, pending.id).subscribe({
      next: () => { this.pendingOperation.set(null); this.pendingDeactivate.set(null); this.restoreModalFocus(); this.message.set('Cadastro inativado no mock; o histórico foi preservado.'); this.loadSection(); },
      error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.pendingDeactivate.set(null); this.restoreModalFocus(); this.showError(error, 'Não foi possível inativar o cadastro.'); },
    });
  }
  protected openDetails(row: ApiRecord): void {
    const resource = this.section(); const id = this.rowId(row);
    if (!this.detail()) this.prepareModal();
    this.detail.set({ resource, record: row }); this.detailLoading.set(true); this.userProfiles.set([]); this.userPermissions.set([]); this.profilePermissions.set([]); this.error.set('');
    if (resource === 'usuarios') {
      forkJoin({ record: this.api.get(resource, id), profiles: this.api.userProfiles(id), effective: this.api.effectivePermissions(id), allProfiles: this.session()?.capabilities.includes('catalog.read') ? this.api.list('perfis', { page: 1, pageSize: 100 }) : of({items:[]}) }).subscribe({
        next: (value) => { this.detail.set({ resource, record: value.record }); this.userProfiles.set(value.profiles.items ?? []); this.userPermissions.set(value.effective.permissoes ?? []); this.availableProfiles.set(value.allProfiles.items ?? []); this.selectedProfileId.set(''); this.detailLoading.set(false); },
        error: (error: HttpErrorResponse) => { this.detailLoading.set(false); this.showError(error, 'Não foi possível carregar o detalhe do usuário.'); },
      });
    } else if (resource === 'perfis') {
      forkJoin({ record: this.api.get(resource, id), associated: this.api.profilePermissions(id), all: this.api.list('permissoes', { page: 1, pageSize: 100 }) }).subscribe({
        next: (value) => { this.detail.set({ resource, record: value.record }); this.profilePermissions.set(value.associated.items ?? []); this.availablePermissions.set(value.all.items ?? []); this.selectedPermissionId.set(''); this.detailLoading.set(false); },
        error: (error: HttpErrorResponse) => { this.detailLoading.set(false); this.showError(error, 'Não foi possível carregar as permissões do perfil.'); },
      });
    } else {
      this.api.get(resource as AniResource, id).subscribe({ next: (record) => { this.detail.set({ resource, record }); this.detailLoading.set(false); }, error: (error: HttpErrorResponse) => { this.detailLoading.set(false); this.showError(error, 'Não foi possível carregar o detalhe.'); } });
    }
  }
  protected closeDetails(): void { this.detail.set(null); this.userProfiles.set([]); this.userPermissions.set([]); this.profilePermissions.set([]); this.restoreModalFocus(); }
  protected handleDialogKeydown(event: KeyboardEvent): void {
    const dialog = event.currentTarget as HTMLElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.decisionDialog()) this.closeDecision();
      else if (this.pendingDeactivate()) this.closeDeactivation();
      else if (this.detail()) this.closeDetails();
      else this.closeEditor();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  protected assignUserProfile(): void {
    const id = String(this.detail()?.record['id'] ?? ''); const profileId = this.selectedProfileId(); if (!id || !profileId || this.pendingOperation()) return;
    this.pendingOperation.set('assign-profile');
    this.api.assignUserProfile(id, profileId).subscribe({ next: () => { this.pendingOperation.set(null); this.message.set(`Perfil associado ${this.operationSource()}.`); this.openDetails(this.detail()!.record); }, error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.showError(error, 'Não foi possível associar o perfil.'); } });
  }
  protected revokeUserProfile(profile: ApiRecord): void {
    const id = String(this.detail()?.record['id'] ?? ''); const profileId = this.rowId(profile); if (!id || !profileId || this.pendingOperation()) return;
    this.pendingOperation.set('revoke-profile');
    this.api.revokeUserProfile(id, profileId).subscribe({ next: () => { this.pendingOperation.set(null); this.message.set(`Perfil revogado ${this.operationSource()}.`); this.openDetails(this.detail()!.record); }, error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.showError(error, 'Não foi possível revogar o perfil.'); } });
  }
  protected assignProfilePermission(): void {
    const id = String(this.detail()?.record['id'] ?? ''); const permissionId = this.selectedPermissionId(); if (!id || !permissionId || this.pendingOperation()) return;
    this.pendingOperation.set('assign-permission');
    this.api.assignProfilePermission(id, permissionId).subscribe({ next: () => { this.pendingOperation.set(null); this.message.set(`Permissão associada ${this.operationSource()}.`); this.openDetails(this.detail()!.record); }, error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.showError(error, 'Não foi possível associar a permissão.'); } });
  }
  protected revokeProfilePermission(permission: ApiRecord): void {
    const id = String(this.detail()?.record['id'] ?? ''); const permissionId = this.rowId(permission); if (!id || !permissionId || this.pendingOperation()) return;
    this.pendingOperation.set('revoke-permission');
    this.api.revokeProfilePermission(id, permissionId).subscribe({ next: () => { this.pendingOperation.set(null); this.message.set(`Permissão revogada ${this.operationSource()}.`); this.openDetails(this.detail()!.record); }, error: (error: HttpErrorResponse) => { this.pendingOperation.set(null); this.showError(error, 'Não foi possível revogar a permissão.'); } });
  }
  protected hasProfile(profile: ApiRecord): boolean { return this.userProfiles().some((item) => this.rowId(item) === this.rowId(profile)); }
  protected hasPermission(permission: ApiRecord): boolean { return this.profilePermissions().some((item) => this.rowId(item) === this.rowId(permission)); }
  protected availableProfilesToAssign(): ApiRecord[] { return this.availableProfiles().filter((item) => item['status'] === 'ativo' && !this.hasProfile(item)); }
  protected availablePermissionsToAssign(): ApiRecord[] { return this.availablePermissions().filter((item) => item['status'] === 'ativo' && !this.hasPermission(item)); }
  private operationSource(): string { return this.session()?.coreMode === 'api' ? 'na API ANI' : 'no mock'; }
  protected editorTitle(): string { const state = this.editor(); return `${state?.id ? 'Editar' : 'Novo cadastro'} · ${navigation.find((item) => item.id === state?.resource)?.label ?? ''}`; }
  protected statusOptions(): { value: string; label: string }[] { return this.editor()?.resource === 'usuarios' ? [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }, { value: 'pendente', label: 'Pendente' }] : [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }]; }
  protected statusFilterOptions(): { value: string; label: string }[] {
    if (this.section() === 'sistemas') return [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }];
    if (this.section() === 'solicitacoes-cadastro') return [{ value: 'pending', label: 'Pendente' }, { value: 'approved', label: 'Aprovada' }, { value: 'rejected', label: 'Rejeitada' }];
    if (this.section() === 'auditoria') return [{ value: 'sucesso', label: 'Sucesso' }, { value: 'negado', label: 'Negado' }];
    if (this.isMaintainedResource(this.section())) return [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }];
    return [];
  }
  protected canDecide(): boolean { return this.session()?.capabilities.includes('requests.approve') ?? false; }
  protected isRequest(): boolean { return this.section() === 'solicitacoes-cadastro'; }
  protected isMaintainedResource(section: Section): section is MaintainedResource { return section === 'usuarios' || section === 'sistemas' || section === 'perfis' || section === 'permissoes'; }
  protected statusLabel(value: unknown): string { const labels: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada', pending: 'Pendente', approved: 'Aprovada', rejected: 'Rejeitada', sucesso: 'Sucesso', negado: 'Negado' }; return labels[String(value ?? '')] ?? this.value(value); }
  protected statusClass(value: unknown): string { const normalized = String(value ?? '').toLocaleLowerCase('pt-BR'); return ['ativo', 'aprovada', 'approved', 'sucesso'].includes(normalized) ? 'positive' : ['inativo', 'rejeitada', 'rejected', 'negado'].includes(normalized) ? 'negative' : 'pending'; }
  protected downloadCsv(): void {
    const keys = this.visibleColumns(); const encode = (value: unknown, key: string) => {
      const text = this.value(value, key);
      // Prevent spreadsheet formula execution when exported values come from user-controlled fields.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const content = [keys.map((key) => encode(this.formatKey(key), key)).join(';'), ...this.rows().map((row) => keys.map((key) => encode(row[key], key)).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ani-${this.section().replaceAll('/','-')}${this.listIsMock()?'-dados-sinteticos':''}-pagina-${this.page()}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  protected get recordCountLabel(): string { if(this.loading())return 'Carregando registros…';if(this.listFailed())return 'Consulta não concluída';const total = this.total(); return `${total} ${total === 1 ? 'registro encontrado' : 'registros encontrados'}`; }

  protected handleSessionExpired(): void { this.clearLocalSession('Sua sessão expirou. Entre novamente para continuar.'); }

  private prepareModal(): void {
    if (!this.modalReturnFocus && document.activeElement instanceof HTMLElement) this.modalReturnFocus = document.activeElement;
    requestAnimationFrame(() => {
      const modal = document.querySelector<HTMLElement>('.modal-backdrop .modal');
      const autofocus = modal?.querySelector<HTMLElement>('[autofocus]');
      const first = modal?.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      (autofocus ?? first ?? modal)?.focus();
    });
  }
  private restoreModalFocus(): void {
    const target = this.modalReturnFocus;
    this.modalReturnFocus = null;
    requestAnimationFrame(() => target?.focus());
  }

  private refreshPendingCount(): void { if (this.session()?.coreMode === 'api') return; this.api.list('solicitacoes-cadastro', { page: 1, pageSize: 100, status: 'pending' }).subscribe({ next: (result) => this.pendingCount.set(result.total ?? result.items.length), error: () => this.pendingCount.set(0) }); }
  private loadSystems(): void {
    this.systemsLoading.set(true);
    this.systemsError.set('');
    this.api.list('sistemas', { page: 1, pageSize: 100, status: 'ativo' }).subscribe({
      next: (result) => { this.systems.set(result.items ?? []); this.systemsLoading.set(false); },
      error: (error: HttpErrorResponse) => { this.systems.set([]); this.systemsLoading.set(false); this.systemsError.set(this.errorMessage(error, 'Não foi possível carregar o catálogo de sistemas.')); },
    });
  }
  private capabilityFor(section: Section): string {
    if (section === 'solicitacoes-cadastro') return 'requests.read';
    if (section === 'usuarios') return 'users.read';
    if (section === 'auditoria') return 'audit.read';
    if (section === 'relatorios/acessos') return 'reports.read';
    return 'catalog.read';
  }
  private clearLocalSession(message: string): void {
    const previous=this.session();
    this.session.set(previous?.authMode==='core'?{authenticated:false,authMode:'core',coreMode:'api',capabilities:[],loginUrl:previous.loginUrl}:null); this.csrfToken.clear(); this.rows.set([]); this.total.set(0);
    this.detail.set(null); this.editor.set(null); this.pendingDeactivate.set(null); this.decisionDialog.set(null);
    this.message.set(message); this.error.set('');
    if(previous?.authMode==='core') this.goToLogin();
  }
  private showError(error: HttpErrorResponse, fallback: string): void {
    if (error.status === 401) {
      this.clearLocalSession('Sua sessão expirou. Entre novamente para continuar.');
      return;
    }
    this.error.set(this.errorMessage(error, fallback));
  }
  private errorMessage(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 0) return 'Não foi possível conectar ao BFF. Verifique se o serviço local está ativo.';
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
    if (error.status === 403) return 'Seu perfil não tem permissão para esta operação.';
    if (error.status === 404) return 'O registro solicitado não foi encontrado.';
    if (error.status === 501) return 'Esta funcionalidade ainda não está disponível na API.';
    if (error.status === 409) return 'O registro mudou ou já foi processado. Atualize a tela e tente novamente.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
    if (error.status === 400 || error.status === 422) return typeof error.error?.title === 'string' ? error.error.title : 'Revise os dados informados.';
    return fallback;
  }
}
