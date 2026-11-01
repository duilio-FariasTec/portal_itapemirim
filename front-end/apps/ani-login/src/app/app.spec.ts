import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('ANI Login', () => {
  let http: HttpTestingController;
  const user = {id:'11111111-1111-1111-1111-111111111111',displayName:'Pessoa sintética'};
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports:[App],providers:[provideHttpClient(),provideHttpClientTesting()]}).compileComponents();
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  async function screen(configured=true) {
    const fixture=TestBed.createComponent(App); fixture.detectChanges();
    http.expectOne('/bff/auth/context').flush({configured,registrationEnabled:configured,authenticated:false,csrfToken:configured?'csrf-sintetico':undefined});
    fixture.detectChanges(); await fixture.whenStable(); return fixture;
  }
  it('shows real credential form without a simulated anti-bot control', async()=>{
    const fixture=await screen(); const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(element.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(element.textContent).toContain('Criar conta');
  });
  it('requests a password reset through the BFF with CSRF and shows the generic API message',async()=>{
    const fixture=await screen(); const element=fixture.nativeElement as HTMLElement;
    const recoveryLink=Array.from(element.querySelectorAll('button')).find(button=>button.textContent?.includes('Esqueceu sua senha?'));
    expect(recoveryLink).toBeDefined();
    recoveryLink?.click(); fixture.detectChanges();
    expect(element.querySelector('#recovery-email')).not.toBeNull();
    expect(element.textContent).toContain('Enviar senha temporária');
    const app=fixture.componentInstance as any;
    app.recoveryLogin.set('pessoa@example.invalid'); app.submitRecovery();
    fixture.detectChanges();
    expect(element.querySelector('#recovery-email')).not.toBeNull();
    expect(app.recoveryLogin()).toBe('pessoa@example.invalid');
    expect(element.textContent).not.toContain('Informe um e-mail válido');
    const request=http.expectOne(req=>req.url==='/bff/auth/password-reset'&&req.method==='POST');
    expect(request.request.body).toEqual({email:'pessoa@example.invalid'});
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-sintetico');
    request.flush({mensagem:'Se as informações informadas corresponderem a uma conta ativa, você receberá um e-mail com as instruções e a senha temporária de acesso.'});
    fixture.detectChanges();
    expect(element.textContent).toContain('Confira seu e-mail');
    expect(element.textContent).toContain('senha temporária de acesso');
  });
  it('validates the recovery email and shows a generic error when the reset API fails',async()=>{
    const fixture=await screen(); const element=fixture.nativeElement as HTMLElement;
    const app=fixture.componentInstance as any;
    app.openRecovery(); app.recoveryLogin.set('nao-e-email'); app.submitRecovery(); fixture.detectChanges();
    expect(element.textContent).toContain('Informe um e-mail válido');
    http.expectNone('/bff/auth/password-reset');
    app.recoveryLogin.set('pessoa@example.invalid'); app.submitRecovery();
    http.expectOne('/bff/auth/password-reset').flush({title:'Conta inexistente'}, {status:502,statusText:'Bad Gateway'});
    fixture.detectChanges();
    expect(element.textContent).toContain('Não foi possível processar a recuperação agora');
    expect(element.textContent).not.toContain('Conta inexistente');
  });
  it('refreshes an expired pre-login CSRF context and retries recovery with the new token',async()=>{
    const fixture=await screen(); const element=fixture.nativeElement as HTMLElement;
    const app=fixture.componentInstance as any;
    app.openRecovery(); app.recoveryLogin.set('pessoa@example.invalid'); app.submitRecovery();
    http.expectOne('/bff/auth/password-reset').flush({title:'Contexto expirado'}, {status:403,statusText:'Forbidden'});
    fixture.detectChanges();
    expect(element.textContent).toContain('A sessão de segurança expirou');
    http.expectOne('/bff/auth/context').flush({configured:true,registrationEnabled:true,authenticated:false,csrfToken:'csrf-renovado'});
    fixture.detectChanges();
    app.submitRecovery();
    const retry=http.expectOne('/bff/auth/password-reset');
    expect(retry.request.body).toEqual({email:'pessoa@example.invalid'});
    expect(retry.request.headers.get('X-CSRF-Token')).toBe('csrf-renovado');
    retry.flush({mensagem:'Solicitação aceita. Confira seu e-mail.'});
    fixture.detectChanges();
    expect(element.textContent).toContain('Confira seu e-mail');
  });
  it('creates a user through the public registration endpoint with email login and CSRF',async()=>{
    const fixture=await screen(); const app=fixture.componentInstance as any;
    app.openRegistration();
    app.fullName.set('Pessoa sintética');
    app.email.set('pessoa@example.invalid');
    app.registrationPassword.set('senha-sintetica');
    app.passwordConfirmation.set('senha-divergente');
    app.submitRegistration();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Confira os campos destacados');
    http.expectNone('/bff/api/v1/usuarios');
    app.passwordConfirmation.set('senha-sintetica');
    app.submitRegistration();
    const request=http.expectOne(req=>req.url==='/bff/api/v1/usuarios'&&req.method==='POST');
    expect(request.request.body).toEqual({nome:'Pessoa sintética',login:'pessoa@example.invalid',email:'pessoa@example.invalid',senha:'senha-sintetica'});
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-sintetico');
    expect(app.registrationPassword()).toBe('');
    expect(app.passwordConfirmation()).toBe('');
    request.flush({ok:true});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('CONTA CRIADA');
    expect(fixture.nativeElement.textContent).toContain('não significa que acessos foram concedidos');
    expect(fixture.nativeElement.textContent).not.toContain('aguarda análise');
  });
  it('blocks public registration when the BFF has not explicitly enabled it',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    http.expectOne('/bff/auth/context').flush({configured:true,registrationEnabled:false,authenticated:false,csrfToken:'csrf-sintetico'});
    fixture.detectChanges();
    const app=fixture.componentInstance as any;
    app.openRegistration();
    fixture.detectChanges();
    app.fullName.set('Pessoa sintética');app.email.set('pessoa@example.invalid');
    app.registrationPassword.set('senha-sintetica');app.passwordConfirmation.set('senha-sintetica');
    app.submitRegistration();
    expect(fixture.nativeElement.textContent).toContain('desabilitado neste ambiente');
    http.expectNone('/bff/api/v1/usuarios');
    http.verify();
  });
  it('disables credential submission when the response contract is not configured',async()=>{
    const fixture=await screen(false);
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('temporariamente indisponível');
  });
  it('sends credentials once through BFF with CSRF, clears password and shows explicit success',async()=>{
    const fixture=await screen(); const app=fixture.componentInstance as any;
    app.login.set(' qa-sintetico '); app.password.set(' senha-sintetica ');
    app.submitLogin(); app.submitLogin();
    const request=http.expectOne('/bff/auth/user-login');
    expect(request.request.body).toEqual({login:'qa-sintetico',senha:' senha-sintetica '});
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf-sintetico');
    expect(app.password()).toBe('');
    request.flush({configured:true,authenticated:true,csrfToken:'csrf-novo',user,adminUrl:'http://127.0.0.1:4200/'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ACESSO VALIDADO');
    expect(fixture.nativeElement.textContent).toContain('Pessoa sintética');
    expect(fixture.nativeElement.querySelector('a[href="http://127.0.0.1:4200/"]')?.textContent).toContain('Continuar para administração');
    app.logout(); http.expectOne('/bff/auth/user-logout').flush({authenticated:false,configured:true});
    http.expectOne('/bff/auth/context').flush({configured:true,authenticated:false,csrfToken:'csrf-outra'});
    fixture.detectChanges(); expect(fixture.nativeElement.querySelector('#password')).not.toBeNull();
  });
  it('does not turn HTTP success without explicit identity into authenticated UI',async()=>{
    const fixture=await screen(); const app=fixture.componentInstance as any;
    app.login.set('qa'); app.password.set('senha-sintetica'); app.submitLogin();
    http.expectOne('/bff/auth/user-login').flush({configured:true,authenticated:false});
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).not.toContain('ACESSO VALIDADO');
    expect(fixture.nativeElement.textContent).toContain('não confirmou');
  });
  it('shows a generic failure without echoing upstream sensitive content',async()=>{
    const fixture=await screen(); const app=fixture.componentInstance as any;
    app.login.set('qa'); app.password.set('senha-sintetica'); app.submitLogin();
    http.expectOne('/bff/auth/user-login').flush({title:'synthetic-private-error'},{status:401,statusText:'Unauthorized'});
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Login ou senha inválidos');
    expect(fixture.nativeElement.textContent).not.toContain('synthetic-private-error');
  });
});
