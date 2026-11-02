import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ApiRecord } from '../../../../../../libs/api-contracts/src';
import { MY_ACCOUNT_API, MyAccess, MyAccountIdentity } from './my-account';

export type MyAccountTab = 'dados' | 'acessos' | 'senha';
type LoadState = 'loading' | 'ready' | 'error';
type PasswordField = 'atual' | 'nova' | 'confirmacao';
type PermissionGroup = { name: string; items: ApiRecord[] };

const tabs: { id: MyAccountTab; label: string }[] = [
  { id: 'dados', label: 'Meus dados' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'senha', label: 'Trocar senha' },
];
const statusLabels: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente' };
const maxPasswordLength = 256;

/** Self-service account screen. Host-agnostic: data flows through MY_ACCOUNT_API and session loss is emitted. */
@Component({ selector: 'ani-meu-perfil', templateUrl: './meu-perfil.component.html', styleUrl: './meu-perfil.component.scss' })
export class MeuPerfilComponent implements OnInit, OnDestroy {
  private readonly api = inject(MY_ACCOUNT_API);
  private readonly subscriptions = new Subscription();

  readonly user = input<MyAccountIdentity | null>(null);
  /** 'api' reads and writes through the host BFF; 'mock' shows the session identity only. */
  readonly source = input<'api' | 'mock'>('api');
  readonly writesEnabled = input(false);
  readonly initialTab = input<MyAccountTab>('dados');
  readonly sessionExpired = output<void>();

  protected readonly tabs = tabs;
  protected readonly activeTab = signal<MyAccountTab>('dados');
  protected readonly profile = signal<ApiRecord | null>(null);
  protected readonly profileState = signal<LoadState>('loading');
  protected readonly access = signal<MyAccess | null>(null);
  protected readonly accessState = signal<LoadState>('loading');
  protected readonly permissionFilter = signal('');
  protected readonly copied = signal(false);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly visible = signal<Record<PasswordField, boolean>>({ atual: false, nova: false, confirmacao: false });
  protected readonly capsLock = signal(false);
  protected readonly submitted = signal(false);
  protected readonly changing = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordSuccess = signal('');

  protected readonly displayName = computed(() => this.text(this.profile()?.['nome']) || this.user()?.displayName || 'Usuário');
  protected readonly initials = computed(() => {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  });
  protected readonly status = computed(() => this.text(this.profile()?.['status']).toLowerCase());
  protected readonly passwordAvailable = computed(() => this.source() === 'api' && this.writesEnabled());
  protected readonly passwordUnavailableReason = computed(() => this.source() !== 'api'
    ? 'Esta sessão de demonstração não altera senhas. Entre com a integração da API ANI para usar este recurso.'
    : 'A troca de senha está desabilitada neste ambiente. Procure o suporte responsável se precisar alterá-la.');
  protected readonly checks = computed(() => {
    const current = this.currentPassword(); const next = this.newPassword(); const confirmation = this.confirmPassword();
    return {
      filled: Boolean(current && next && confirmation),
      different: Boolean(current) && Boolean(next) && next !== current,
      matches: Boolean(confirmation) && next === confirmation,
      minimumLength: next.length >= 8,
      withinLimit: current.length <= maxPasswordLength && next.length <= maxPasswordLength,
    };
  });
  protected readonly canSubmitPassword = computed(() => {
    const check = this.checks();
    return this.passwordAvailable() && !this.changing() && this.profileState() === 'ready' && check.filled && check.minimumLength && check.different && check.matches && check.withinLimit;
  });
  protected readonly permissionGroups = computed<PermissionGroup[]>(() => {
    const filter = this.permissionFilter().trim().toLocaleLowerCase('pt-BR');
    const groups = new Map<string, ApiRecord[]>();
    for (const permission of this.access()?.permissoes ?? []) {
      const searchable = ['nome', 'codigo', 'recurso', 'acao', 'escopo'].map((key) => this.text(permission[key])).join(' ').toLocaleLowerCase('pt-BR');
      if (filter && !searchable.includes(filter)) continue;
      const name = this.text(permission['recurso']) || this.text(permission['codigo']).split('.')[0] || 'Geral';
      groups.set(name, [...(groups.get(name) ?? []), permission]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([name, items]) => ({ name, items }));
  });

  ngOnInit(): void {
    this.activeTab.set(this.initialTab());
    this.reload();
  }
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clearPasswords();
  }

  reload(): void {
    this.copied.set(false);
    if (this.source() !== 'api') {
      const user = this.user();
      this.profile.set(user ? { id: user.id, nome: user.displayName } : null);
      this.profileState.set(user ? 'ready' : 'error');
      this.access.set({ origem: 'sessao', perfis: user?.profileLabel ? [{ nome: user.profileLabel }] : [], permissoes: [] });
      this.accessState.set('ready');
      return;
    }
    this.profileState.set('loading');
    this.accessState.set('loading');
    this.subscriptions.add(this.api.profile().subscribe({
      next: (profile) => { this.profile.set(profile); this.profileState.set('ready'); },
      error: (error: HttpErrorResponse) => { this.profile.set(null); this.profileState.set('error'); this.handleSessionLoss(error); },
    }));
    this.subscriptions.add(this.api.access().subscribe({
      next: (access) => { this.access.set(access); this.accessState.set('ready'); },
      error: (error: HttpErrorResponse) => { this.access.set(null); this.accessState.set('error'); this.handleSessionLoss(error); },
    }));
  }

  protected selectTab(tab: MyAccountTab, focusTab = false): void {
    this.activeTab.set(tab);
    if (focusTab) requestAnimationFrame(() => document.getElementById(`perfil-tab-${tab}`)?.focus());
  }
  protected openPassword(): void {
    this.selectTab('senha');
    if (this.passwordAvailable()) requestAnimationFrame(() => document.getElementById('perfil-senha-atual')?.focus());
  }
  protected handleTabKeydown(event: KeyboardEvent): void {
    const index = tabs.findIndex((tab) => tab.id === this.activeTab());
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (target < 0) return;
    event.preventDefault();
    this.selectTab(tabs[target].id, true);
  }

  protected async copyIdentifier(): Promise<void> {
    const id = this.text(this.profile()?.['id']);
    if (!id || !navigator.clipboard) return;
    try { await navigator.clipboard.writeText(id); this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); } catch { this.copied.set(false); }
  }

  protected toggleVisibility(field: PasswordField): void { this.visible.update((value) => ({ ...value, [field]: !value[field] })); }
  protected detectCapsLock(event: KeyboardEvent): void { if (typeof event.getModifierState === 'function') this.capsLock.set(event.getModifierState('CapsLock')); }
  protected updatePassword(field: PasswordField, value: string): void {
    (field === 'atual' ? this.currentPassword : field === 'nova' ? this.newPassword : this.confirmPassword).set(value);
    this.passwordError.set('');
    if (value) this.passwordSuccess.set('');
  }
  protected cancelPassword(): void {
    if (this.changing()) return;
    this.clearPasswords();
    this.passwordError.set('');
    this.passwordSuccess.set('');
    this.selectTab('dados', true);
  }
  protected changePassword(): void {
    this.submitted.set(true);
    if (!this.canSubmitPassword()) {
      if (this.passwordAvailable() && !this.changing()) this.passwordError.set(this.validationMessage());
      return;
    }
    const body = { senhaAtual: this.currentPassword(), novaSenha: this.newPassword() };
    this.changing.set(true);
    this.passwordError.set('');
    this.passwordSuccess.set('');
    this.subscriptions.add(this.api.changePassword(body).subscribe({
      next: () => {
        body.senhaAtual = ''; body.novaSenha = '';
        this.changing.set(false);
        this.clearPasswords();
        this.passwordSuccess.set('Senha alterada com sucesso. Use a nova senha no próximo acesso.');
      },
      error: (error: HttpErrorResponse) => {
        body.senhaAtual = ''; body.novaSenha = '';
        this.changing.set(false);
        this.clearPasswords();
        if (this.handleSessionLoss(error)) return;
        this.passwordError.set(this.passwordErrorMessage(error));
      },
    }));
  }

  protected tabBadge(tab: MyAccountTab): string {
    if (tab === 'acessos' && this.accessState() === 'ready') return String(this.access()?.perfis.length ?? 0);
    if (tab === 'senha' && !this.passwordAvailable()) return 'Indisponível';
    return '';
  }
  protected statusLabel(value: unknown): string { const text = this.text(value).toLowerCase(); return statusLabels[text] ?? (this.text(value) || '—'); }
  protected statusTone(value: unknown): string { const text = this.text(value).toLowerCase(); return text === 'ativo' ? 'positive' : text === 'inativo' ? 'negative' : text === 'pendente' ? 'pending' : ''; }
  protected value(value: unknown): string { return this.text(value) || '—'; }
  protected date(value: unknown): string {
    const text = this.text(value); if (!text) return '—';
    const parsed = new Date(text);
    return Number.isNaN(parsed.valueOf()) ? text : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  }
  protected permissionDetail(permission: ApiRecord): string {
    const parts = ['acao', 'escopo'].map((key) => this.text(permission[key])).filter(Boolean);
    return parts.length ? parts.join(' · ') : this.text(permission['codigo']);
  }
  protected text(value: unknown): string { return value === undefined || value === null ? '' : String(value).trim(); }

  private validationMessage(): string {
    const check = this.checks();
    if (!check.filled) return 'Preencha a senha atual, a nova senha e a confirmação.';
    if (!check.withinLimit) return `As senhas devem ter até ${maxPasswordLength} caracteres.`;
    if (!check.minimumLength) return 'A nova senha deve ter pelo menos 8 caracteres.';
    if (!check.different) return 'A nova senha deve ser diferente da senha atual.';
    if (!check.matches) return 'A confirmação não corresponde à nova senha.';
    return 'Revise os dados informados.';
  }
  private passwordErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.';
    if (error.status === 403) return 'A troca de senha não está permitida para esta sessão.';
    if (error.status === 409) return 'Já existe uma alteração em andamento. Aguarde e tente novamente.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.';
    if (error.status === 400 || error.status === 422) return 'A API recusou a alteração. Confira a senha atual e se a nova senha atende à política de senhas.';
    return 'Não foi possível trocar a senha agora. Tente novamente em instantes.';
  }
  private handleSessionLoss(error: HttpErrorResponse): boolean {
    if (error.status !== 401) return false;
    this.clearPasswords();
    this.sessionExpired.emit();
    return true;
  }
  private clearPasswords(): void {
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.visible.set({ atual: false, nova: false, confirmacao: false });
    this.capsLock.set(false);
    this.submitted.set(false);
  }
}
