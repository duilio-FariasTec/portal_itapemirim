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
    http.expectOne('/bff/auth/context').flush({configured,authenticated:false,csrfToken:configured?'csrf-sintetico':undefined});
    fixture.detectChanges(); await fixture.whenStable(); return fixture;
  }
  it('shows real credential form without a simulated anti-bot control', async()=>{
    const fixture=await screen(); const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(element.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(element.textContent).toContain('Solicitar acesso');
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
