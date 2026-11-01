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
    expect(labels).toEqual(['Visão geral','Meu Perfil','Solicitações de acesso','Usuários','Sistemas','Perfis','Permissões','Auditoria','Relatórios de acesso']);
    expect(fixture.nativeElement.textContent).toContain('Aguardando integração');
    http.verify();
  });
  it('opens Meu Perfil from the avatar, shows own data and access, and submits only the password fields',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',writesEnabled:true,capabilities:[],user:{id:'11111111-1111-1111-1111-111111111111',displayName:'Pessoa sintética',profileLabel:'Consulta'}});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.user-menu .avatar') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/bff/api/v1/me').flush({id:'11111111-1111-1111-1111-111111111111',nome:'Pessoa sintética',login:'pessoa.demo',email:'pessoa@example.invalid',status:'ativo'});
    http.expectOne('/bff/api/v1/me/acessos').flush({origem:'api',perfis:[{id:'p1',nome:'Consulta sintética',sistemaNome:'Sistema sintético',status:'ativo'}],permissoes:[{id:'x1',nome:'Ver usuários',recurso:'usuarios',acao:'ler',escopo:'global'}]});
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.account-hero')?.textContent).toContain('pessoa@example.invalid');
    expect(element.querySelector('#perfil-painel-dados')?.textContent).toContain('pessoa.demo');
    (element.querySelector('#perfil-tab-acessos') as HTMLButtonElement).click();fixture.detectChanges();
    expect(element.querySelector('#perfil-painel-acessos')?.textContent).toContain('Sistema sintético');
    expect(element.querySelector('#perfil-painel-acessos')?.textContent).toContain('Ver usuários');
    (element.querySelector('#perfil-tab-senha') as HTMLButtonElement).click();fixture.detectChanges();
    const type=(id:string,value:string)=>{const input=element.querySelector(id) as HTMLInputElement;input.value=value;input.dispatchEvent(new Event('input'));};
    type('#perfil-senha-atual','senha-atual-sintetica');type('#perfil-senha-nova','senha-nova-sintetica');type('#perfil-senha-confirmacao','senha-nova-sintetica');
    fixture.detectChanges();
    (element.querySelector('.password-form button[type="submit"]') as HTMLButtonElement).click();
    const change=http.expectOne('/bff/api/v1/auth/trocar-senha');
    expect(change.request.body).toEqual({senhaAtual:'senha-atual-sintetica',novaSenha:'senha-nova-sintetica'});
    change.flush({ok:true});fixture.detectChanges();
    expect(element.textContent).toContain('Senha alterada com sucesso.');
    expect((element.querySelector('#perfil-senha-atual') as HTMLInputElement).value).toBe('');
    http.verify();
  });
  it('loads systems through the new read-only catalog route',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['catalog.read'],user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Consulta'}});
    const app=fixture.componentInstance as any;
    app.select('sistemas');
    const request=http.expectOne(request=>request.url==='/bff/api/v1/sistemas');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush({items:[{id:'11111111-1111-1111-1111-111111111111',codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Catálogo de teste',status:'ativo'}],total:1,page:1,pageSize:25});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sistema sintético');
    expect(fixture.nativeElement.textContent).toContain('SISTEMA_SINTETICO');
    expect(fixture.nativeElement.textContent).not.toContain('Novo cadastro');
    http.verify();
  });
  it('creates and updates systems only when the BFF grants catalog write',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['catalog.read','catalog.write'],writesEnabled:true,user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Operador'}});
    const app=fixture.componentInstance as any;
    app.select('sistemas');
    const firstList=http.expectOne(request=>request.url==='/bff/api/v1/sistemas');
    firstList.flush({items:[{id:'11111111-1111-1111-1111-111111111111',codigo:'SISTEMA_TESTE',nome:'Sistema de teste',descricao:'Descrição',status:'ativo'}],total:1,page:1,pageSize:25});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('+ Novo cadastro');
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(button=>button.textContent?.trim()==='Inativar')).toBe(false);

    app.createRecord();
    app.setEditorValue('nome','Novo sistema');
    app.setEditorValue('codigo','NOVO_SISTEMA');
    app.setEditorValue('descricao','Descrição sintética');
    app.setEditorValue('status','ativo');
    app.saveRecord();
    const create=http.expectOne(request=>request.url==='/bff/api/v1/sistemas'&&request.method==='POST');
    expect(create.request.body).toEqual({nome:'Novo sistema',codigo:'NOVO_SISTEMA',descricao:'Descrição sintética',status:'ativo'});
    create.flush({ok:true});
    http.expectOne(request=>request.url==='/bff/api/v1/sistemas').flush({items:[],total:0,page:1,pageSize:25});

    app.editRecord({id:'11111111-1111-1111-1111-111111111111',codigo:'SISTEMA_TESTE',nome:'Sistema de teste',descricao:'Descrição',status:'ativo'});
    app.setEditorValue('nome','Sistema atualizado');
    app.saveRecord();
    const update=http.expectOne(request=>request.url==='/bff/api/v1/sistemas/11111111-1111-1111-1111-111111111111'&&request.method==='PUT');
    expect(update.request.body).toMatchObject({nome:'Sistema atualizado',codigo:'SISTEMA_TESTE'});
    update.flush({ok:true});
    http.expectOne(request=>request.url==='/bff/api/v1/sistemas').flush({items:[],total:0,page:1,pageSize:25});
    http.verify();
  });
  it('loads system choices and preserves the system relation through profile CRUD and filtering',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['catalog.read','catalog.write'],writesEnabled:true,user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Operador'}});
    const app=fixture.componentInstance as any;
    app.select('perfis');
    const profileList=http.expectOne(request=>request.url==='/bff/api/v1/perfis');
    const systems=http.expectOne(request=>request.url==='/bff/api/v1/sistemas');
    expect(systems.request.params.get('status')).toBe('ativo');
    const systemId='11111111-1111-1111-1111-111111111111';
    profileList.flush({items:[],total:0,page:1,pageSize:25});
    systems.flush({items:[{id:systemId,nome:'Sistema sintético',status:'ativo'}],total:1,page:1,pageSize:100});
    fixture.detectChanges();

    app.createRecord();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name="sistemaId"]')).not.toBeNull();
    app.setEditorValue('nome','Perfil sintético');
    app.setEditorValue('sistemaId',systemId);
    app.setEditorValue('descricao','Perfil de teste');
    app.setEditorValue('status','ativo');
    app.saveRecord();
    const create=http.expectOne(request=>request.url==='/bff/api/v1/perfis'&&request.method==='POST');
    expect(create.request.body).toEqual({nome:'Perfil sintético',sistemaId:systemId,descricao:'Perfil de teste',status:'ativo'});
    create.flush({ok:true});
    http.expectOne(request=>request.url==='/bff/api/v1/perfis').flush({items:[],total:0,page:1,pageSize:25});

    app.editRecord({id:systemId,nome:'Perfil sintético',sistemaId:systemId,sistemaNome:'Sistema sintético',descricao:'Perfil de teste',status:'ativo'});
    app.setEditorValue('nome','Perfil atualizado');
    app.saveRecord();
    const update=http.expectOne(request=>request.url===`/bff/api/v1/perfis/${systemId}`&&request.method==='PUT');
    expect(update.request.body).toMatchObject({nome:'Perfil atualizado',sistemaId:systemId});
    update.flush({ok:true});
    http.expectOne(request=>request.url==='/bff/api/v1/perfis').flush({items:[],total:0,page:1,pageSize:25});

    app.systemInput.set(systemId);
    app.applyFilters();
    const filtered=http.expectOne(request=>request.url==='/bff/api/v1/perfis');
    expect(filtered.request.params.get('sistemaId')).toBe(systemId);
    filtered.flush({items:[],total:0,page:1,pageSize:25});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sistema');
    http.verify();
  });
  it('uses the documented result filter and hides unsupported free-text search in audit',async()=>{
    const fixture=TestBed.createComponent(App);fixture.detectChanges();
    const http=TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session').flush({authenticated:true,authMode:'core',coreMode:'api',capabilities:['audit.read'],user:{id:'synthetic-user',displayName:'Pessoa sintética',profileLabel:'Consulta'}});
    const app=fixture.componentInstance as any;
    app.select('auditoria');
    http.expectOne(request=>request.url==='/bff/api/v1/auditoria').flush({items:[],total:0,page:1,pageSize:25});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="search"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Resultado');
    app.statusInput.set('negado');
    app.applyFilters();
    const filtered=http.expectOne(request=>request.url==='/bff/api/v1/auditoria');
    expect(filtered.request.params.get('status')).toBe('negado');
    filtered.flush({items:[],total:0,page:1,pageSize:25});
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
