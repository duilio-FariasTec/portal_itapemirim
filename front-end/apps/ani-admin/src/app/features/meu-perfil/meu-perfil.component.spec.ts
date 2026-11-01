import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { MeuPerfilComponent } from './meu-perfil.component';
import { MY_ACCOUNT_API, MyAccess, MyAccountApi } from './my-account';

const user = { id: '11111111-1111-1111-1111-111111111111', displayName: 'Pessoa Sintética Teste', profileLabel: 'Consulta' };
const profile = { id: user.id, nome: user.displayName, login: 'pessoa.demo', email: 'pessoa@example.invalid', status: 'ativo' };

function setup(api: Partial<MyAccountApi>, inputs: { source?: 'api' | 'mock'; writesEnabled?: boolean } = {}) {
  const fake: MyAccountApi = {
    profile: () => of(profile),
    access: () => of<MyAccess>({ origem: 'api', perfis: [], permissoes: [] }),
    changePassword: () => of({ ok: true }),
    ...api,
  };
  TestBed.configureTestingModule({ imports: [MeuPerfilComponent], providers: [{ provide: MY_ACCOUNT_API, useValue: fake }] });
  const fixture = TestBed.createComponent(MeuPerfilComponent);
  fixture.componentRef.setInput('user', user);
  fixture.componentRef.setInput('source', inputs.source ?? 'api');
  fixture.componentRef.setInput('writesEnabled', inputs.writesEnabled ?? true);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string) => { const input = element.querySelector(id) as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const openTab = (tab: string) => { (element.querySelector(`#perfil-tab-${tab}`) as HTMLButtonElement).click(); fixture.detectChanges(); };
  return { fixture, element, type, openTab, fake };
}

describe('MeuPerfilComponent', () => {
  it('shows initials and identity in the header and keeps password change unavailable when writes are disabled', () => {
    const changePassword = vi.fn();
    const { element, openTab } = setup({ changePassword }, { writesEnabled: false });
    expect(element.querySelector('.account-avatar')?.textContent?.trim()).toBe('PT');
    expect(element.querySelector('#perfil-tab-senha')?.textContent).toContain('Indisponível');
    openTab('senha');
    expect(element.querySelector('.password-form')).toBeNull();
    expect(element.querySelector('#perfil-painel-senha')?.textContent).toContain('desabilitada neste ambiente');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('blocks submission when the new password repeats the current one or the confirmation differs', () => {
    const changePassword = vi.fn(() => of({ ok: true }));
    const { element, type, openTab, fixture } = setup({ changePassword });
    openTab('senha');
    type('#perfil-senha-atual', 'mesma-senha'); type('#perfil-senha-nova', 'mesma-senha'); type('#perfil-senha-confirmacao', 'mesma-senha');
    (element.querySelector('.password-form button[type="submit"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('diferente da senha atual');
    type('#perfil-senha-nova', 'outra-senha'); type('#perfil-senha-confirmacao', 'nao-confere');
    (element.querySelector('.password-form button[type="submit"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('confirmação não corresponde');
    expect(element.querySelector('#perfil-senha-confirmacao')?.getAttribute('aria-invalid')).toBe('true');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('clears the form and notifies the host when the session expires during the change', () => {
    const { element, type, openTab, fixture } = setup({ changePassword: () => throwError(() => new HttpErrorResponse({ status: 401 })) });
    const expired = vi.fn(); fixture.componentInstance.sessionExpired.subscribe(expired);
    openTab('senha');
    type('#perfil-senha-atual', 'senha-atual'); type('#perfil-senha-nova', 'senha-nova'); type('#perfil-senha-confirmacao', 'senha-nova');
    (element.querySelector('.password-form button[type="submit"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(expired).toHaveBeenCalledOnce();
    expect((element.querySelector('#perfil-senha-atual') as HTMLInputElement).value).toBe('');
  });

  it('explains a recoverable API refusal without exposing server details', () => {
    const { element, type, openTab, fixture } = setup({ changePassword: () => throwError(() => new HttpErrorResponse({ status: 422, error: { title: 'detalhe interno' } })) });
    openTab('senha');
    type('#perfil-senha-atual', 'senha-atual'); type('#perfil-senha-nova', 'senha-nova'); type('#perfil-senha-confirmacao', 'senha-nova');
    (element.querySelector('.password-form button[type="submit"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('política de senhas');
    expect(element.textContent).not.toContain('detalhe interno');
  });

  it('groups effective permissions, filters them and flags login-claim summaries', () => {
    const permissoes = Array.from({ length: 7 }, (_, index) => ({ codigo: index < 4 ? `usuarios.acao${index}` : `auditoria.acao${index}`, nome: index < 4 ? `usuarios.acao${index}` : `auditoria.acao${index}` }));
    const { element, openTab, fixture } = setup({ access: () => of<MyAccess>({ origem: 'sessao', perfis: [{ nome: 'Consulta' }], permissoes }) });
    openTab('acessos');
    expect(element.querySelector('.account-note')?.textContent).toContain('Resumo confirmado no seu login');
    expect(Array.from(element.querySelectorAll('.permission-group h4')).map((node) => node.textContent)).toEqual(['auditoria', 'usuarios']);
    const filter = element.querySelector('.account-filter') as HTMLInputElement;
    filter.value = 'auditoria'; filter.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(element.querySelectorAll('.permission-group').length).toBe(1);
  });

  it('keeps independent loading states and supports keyboard tab navigation', () => {
    const access = new Subject<MyAccess>();
    const { element, fixture } = setup({ access: () => access.asObservable() });
    expect(element.querySelector('#perfil-painel-dados')?.textContent).toContain('pessoa.demo');
    const tab = element.querySelector('#perfil-tab-dados') as HTMLButtonElement;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); fixture.detectChanges();
    expect(element.querySelector('#perfil-tab-acessos')?.getAttribute('aria-selected')).toBe('true');
    expect(element.querySelector('#perfil-painel-acessos')?.textContent).toContain('Carregando seus acessos');
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); fixture.detectChanges();
    expect(element.querySelector('#perfil-tab-senha')?.getAttribute('aria-selected')).toBe('true');
    access.complete();
  });

  it('shows only the session identity in demonstration mode without calling the API', () => {
    const profileCall = vi.fn(() => of(profile));
    const { element } = setup({ profile: profileCall }, { source: 'mock' });
    expect(profileCall).not.toHaveBeenCalled();
    expect(element.querySelector('.account-tags')?.textContent).toContain('Demonstração');
    expect(element.querySelector('#perfil-tab-senha')?.textContent).toContain('Indisponível');
  });
});
