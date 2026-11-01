import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows the local demo sign-in when no session exists', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({ authenticated: false, authMode: 'mock', capabilities: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Administração');
    expect(compiled.textContent).toContain('Entrar no modo de demonstração');
    http.verify();
  });
  it('routes API users to ANI Login and never renders the former integration key',async()=>{
    const fixture=TestBed.createComponent(App);
    const app=fixture.componentInstance as any;
    const navigation=vi.spyOn(app,'goToLogin').mockImplementation(()=>{});
    fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:false,authMode:'core',coreMode:'api',loginUrl:'http://127.0.0.1:4201/',capabilities:[]});
    fixture.detectChanges();await fixture.whenStable();
    expect(navigation).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('#integration-key')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Entrar com login e senha');
    http.verify();
  });
  it('shows failed queries separately from a genuinely empty list and recovers on retry',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['users.read'],user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Consulta'}});
    const app=fixture.componentInstance as any;app.select('usuarios');
    http.expectOne(request=>request.url==='/bff/api/v1/usuarios').flush({title:'Resposta inválida'},{status:502,statusText:'Bad Gateway'});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consulta não concluída');
    expect(fixture.nativeElement.textContent).not.toContain('Nenhum registro encontrado');
    expect(fixture.nativeElement.textContent).not.toContain('0 registros encontrados');
    app.error.set('');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Nenhum registro encontrado');
    app.loadSection();
    http.expectOne(request=>request.url==='/bff/api/v1/usuarios').flush({items:[{id:'synthetic-user',nome:'Pessoa sintética',status:'ativo'}],total:1,page:1,pageSize:25});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 registro encontrado');
    expect(fixture.nativeElement.textContent).toContain('Pessoa sintética');
    expect(fixture.nativeElement.textContent).not.toContain('Consulta não concluída');
    http.verify();
  });
  it('shows every menu when the BFF grants the administrator read capabilities',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['dashboard.read','requests.read','users.read','catalog.read','audit.read','reports.read'],user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Administrador'}});
    fixture.detectChanges();
    const labels=Array.from(fixture.nativeElement.querySelectorAll('.nav-item') as NodeListOf<HTMLElement>).map(node=>node.textContent?.trim());
    expect(labels).toEqual(['Visão geral','Solicitações de acesso','Usuários','Sistemas','Perfis','Permissões','Auditoria','Relatórios de acesso']);
    expect(fixture.nativeElement.textContent).toContain('Aguardando integração');
    http.verify();
  });
  it('labels the demonstration report without labeling subsequent Core lists as mock',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['reports.read','users.read'],user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Administrador'}});
    const app=fixture.componentInstance as any;app.select('relatorios/acessos');
    http.expectOne(request=>request.url==='/bff/api/v1/relatorios/acessos').flush({items:[{id:'demo-a',sistema:'Sistema demonstrativo A',usuariosAtivos:12,perfisAtivos:3}],total:1,page:1,pageSize:25,dataMode:'mock'});
    fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Relatório demonstrativo');
    expect(fixture.nativeElement.textContent).toContain('não representam os acessos do QA');
    expect(fixture.nativeElement.querySelector('.section-heading').textContent).not.toContain('Dados recebidos pela API');
    app.select('usuarios');http.expectOne(request=>request.url==='/bff/api/v1/usuarios').flush({items:[],total:0,page:1,pageSize:25});
    fixture.detectChanges();expect(fixture.nativeElement.textContent).not.toContain('Relatório demonstrativo');
    expect(fixture.nativeElement.querySelector('.section-heading').textContent).toContain('Dados recebidos pela API');http.verify();
  });
});
