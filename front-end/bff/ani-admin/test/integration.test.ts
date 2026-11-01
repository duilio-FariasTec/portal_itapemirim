import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApiServer, configuration } from '../src/api-server.ts';
import { assertCoreRoute, coreQuery, coreDestination, callCore } from '../src/core-client.ts';
import { requestBody, responseBody } from '../src/contracts.ts';

const guid = '11111111-1111-1111-1111-111111111111';
test('allowlist enforces methods, UUIDs and unavailable domains', () => {
  assertCoreRoute('GET', '/usuarios');
  assertCoreRoute('POST', `/usuarios/${guid}/perfis`);
  assertCoreRoute('DELETE', `/perfis/${guid}/permissoes/${guid}`);
  for (const [method, path] of [['GET','/auth/login'], ['PATCH',`/usuarios/${guid}`], ['GET','/usuarios/invalid'], ['POST',`/auditoria/${guid}`]]) assert.throws(() => assertCoreRoute(method, path));
  assert.throws(() => assertCoreRoute('GET','/portais'), {statusCode:501});
});
test('query translation validates limits, duplicates and unsupported filters', () => {
  assert.equal(coreQuery('/usuarios',new URLSearchParams({page:'2',pageSize:'25',search:'Sintetico'})).toString(),'PageNumber=2&PageSize=25&Busca=Sintetico');
  assert.equal(coreQuery('/perfis',new URLSearchParams({page:'2',pageSize:'25',search:'Teste',status:'inativo'})).toString(),'');
  for (const q of ['page=0','pageSize=101','page=1&page=2','sort=nome']) assert.throws(() => coreQuery('/usuarios',new URLSearchParams(q)), {statusCode:400});
  assert.throws(() => coreDestination('http://remote.example.invalid'));
  assert.throws(() => coreDestination('https://remote.example.invalid/?token=x'));
});
test('write DTOs reject mass assignment, unsupported system scope and immutable login', () => {
  assert.deepEqual(requestBody('/perfis','POST',{nome:'Teste',status:'ativo'}),{nome:'Teste',ativo:true});
  assert.throws(() => requestBody('/perfis','POST',{nome:'Teste',sistemaId:guid}),{statusCode:422});
  assert.throws(() => requestBody(`/usuarios/${guid}`,'PUT',{nome:'Teste',email:'teste@example.invalid',login:'novo'}),{statusCode:422});
  assert.throws(() => requestBody(`/usuarios/${guid}/perfis`,'POST',{perfilId:'bad'}),{statusCode:400});
});
test('response projection removes secrets and paginates bounded catalogs', () => {
  const result = responseBody('/perfis','GET',[{guid,nome:'Teste',ativo:true,senha:'sintetica',senhaHash:'hash-sintetico'}],new URLSearchParams({page:'1',pageSize:'25'})) as any;
  assert.equal(result.items[0].id,guid); assert.equal(result.items[0].status,'ativo');
  assert.equal(result.items[0].senha,undefined); assert.equal(result.items[0].senhaHash,undefined);
  assert.throws(() => responseBody('/usuarios','GET',[],new URLSearchParams()),{statusCode:502});
  assert.throws(() => responseBody('/usuarios','GET',{unexpected:[]},new URLSearchParams()),{statusCode:502});
});
test('configuration requires local trusted destinations without a shared-key login', () => {
  const env = {NODE_ENV:'test',ANI_CORE_BASE_URL:'https://api.example.invalid',ANI_BFF_ACCESS_KEY:'x'.repeat(32)};
  assert.equal(configuration(env).writes,false);
  assert.throws(() => configuration({...env,NODE_ENV:'production'}));
  assert.equal(configuration({...env,ANI_BFF_ACCESS_KEY:''}).port,3333);
  assert.throws(()=>configuration({...env,ANI_LOGIN_FRONTEND_URL:'https://evil.example.invalid/'}));
  assert.throws(() => configuration({...env,ANI_ALLOWED_ORIGINS:'https://browser.example.invalid'}));
});
test('real HTTP transport and BFF: authentication, CSRF, read-only default, DTOs, logout and no mock fallback', async () => {
  const calls: string[] = [];
  const upstream = createServer(async (req,res) => {
    if(req.url==='/api/v1/auth/login') {
      for await(const _chunk of req) {}
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo',permissoes:[{codigo:'home.view',nome:'Não usado para autorização'},{codigo:'usuarios.manage',nome:'Não usado para autorização'}]}}));return;
    }
    calls.push(`${req.method} ${req.url}`);
    assert.equal(req.headers.authorization,'Bearer '+'qa-token-sintetico'.repeat(3));
    res.setHeader('Content-Type','application/json');
    if (req.method === 'POST') { res.end('{"guid":"'+guid+'","senhaHash":"sintetico"}'); return; }
    res.end(JSON.stringify({items:[{guid,nome:'Pessoa sintética',email:'qa@example.invalid',status:'ativo',senhaHash:'sintetico'}],totalCount:1}));
  });
  await new Promise<void>(resolve => upstream.listen(0,'127.0.0.1',resolve));
  const config = {baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,accessKey:'s'.repeat(32),port:0,origins:new Set(['http://127.0.0.1:4200']),writes:false};
  const bff = createApiServer(config);
  await new Promise<void>(resolve => bff.listen(0,'127.0.0.1',resolve));
  config.port = (bff.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${config.port}`;
  const origin = 'http://127.0.0.1:4200';
  try {
    assert.equal((await fetch(base+'/bff/api/v1/usuarios')).status,401);
    assert.equal((await fetch(base+'/bff/api/v1/relatorios/acessos')).status,401);
    assert.equal((await fetch(base+'/bff/auth/integration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,404);
    const bootstrap=await fetch(base+'/bff/auth/context'); const context=await bootstrap.json() as any;
    const preCookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
    const login = await fetch(base+'/bff/auth/user-login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:preCookie,'X-CSRF-Token':context.csrfToken},body:JSON.stringify({login:'qa-sintetico',senha:'senha-sintetica'})});
    assert.equal(login.status,200); const session = await login.json() as any;
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = {Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken};
    const users = await fetch(base+'/bff/api/v1/usuarios?page=1&pageSize=25',{headers});
    assert.equal(users.status,200); const page = await users.json() as any;
    assert.equal(page.total,1); assert.equal(page.items[0].senhaHash,undefined);
    assert.equal(calls[0],'GET /api/v1/usuarios?PageNumber=1&PageSize=25');
    const adminState=await fetch(base+'/bff/session',{headers});const view=await adminState.json() as any;
    assert.equal(view.authMode,'core');assert.equal(view.user.id,guid);assert.deepEqual(view.capabilities,['dashboard.read','users.read']);
    assert.equal(view.authorization,undefined);
    assert.equal((await fetch(base+'/bff/api/v1/perfis',{headers})).status,403);
    assert.equal((await fetch(base+'/bff/api/v1/relatorios/acessos',{headers})).status,403);
    assert.equal((await fetch(base+'/bff/api/v1/portais',{headers})).status,501);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:'{}'})).status,403);
    config.writes = true;
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers:{...headers,'X-CSRF-Token':'invalid'},body:'{}'})).status,403);
    const write = await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({nome:'Pessoa sintética',email:'qa@example.invalid',login:'qa'})});
    assert.equal(write.status,200); assert.deepEqual(await write.json(),{ok:true});
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{headers:{...headers,Origin:'https://evil.example.invalid'}})).status,403);
    assert.equal((await fetch(base+'/bff/auth/logout',{method:'POST',headers,body:'{}'})).status,200);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{headers})).status,401);
  } finally { await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]); }
});
test('transport rejects redirects without following them', async () => {
  const upstream = createServer((_req,res) => {res.writeHead(302,{Location:'http://127.0.0.1:1/private'});res.end();});
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try { await assert.rejects(callCore(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,'GET','/usuarios',new URLSearchParams()),{statusCode:502}); }
  finally { await new Promise<void>(resolve=>upstream.close(()=>resolve())); }
});
test('transport bounds response size and sanitizes upstream errors and invalid JSON', async () => {
  let mode = 'error';
  const upstream = createServer((_req,res) => {
    res.setHeader('Content-Type','application/json');
    if (mode === 'error') {res.statusCode=500;res.end('{"secret":"synthetic-do-not-relay"}');}
    else if (mode === 'oversize') res.end('"'+'a'.repeat(2_000_001)+'"');
    else res.end('invalid json');
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  try {
    await assert.rejects(callCore(base,'GET','/usuarios',new URLSearchParams()),error => {assert.equal((error as Error).message,'API ANI indisponível');return true;});
    mode='oversize'; await assert.rejects(callCore(base,'GET','/usuarios',new URLSearchParams()),{statusCode:502});
    mode='json'; await assert.rejects(callCore(base,'GET','/usuarios',new URLSearchParams()),{statusCode:502});
  } finally { await new Promise<void>(resolve=>upstream.close(()=>resolve())); }
});
test('user login: explicit Core identity, session rotation, failed HTTP 200, no admin grants and logout', async()=>{
  let responseMode='ok'; let calls=0;
  const upstream=createServer(async(req,res)=>{
    calls++; assert.equal(req.url,'/api/v1/auth/login'); assert.equal(req.method,'POST');
    let raw=''; for await(const chunk of req) raw+=chunk;
    assert.deepEqual(JSON.parse(raw),{login:'qa-sintetico',senha:' senha-sintetica '});
    res.setHeader('Content-Type','application/json');
    res.statusCode=responseMode==='unprocessable'?422:200;
    res.end(JSON.stringify(responseMode==='ok'?{token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo',senhaHash:'not-for-browser'}}:responseMode==='false'?{authenticated:false}:{ok:true}));
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,accessKey:'s'.repeat(32),port:0,origins:new Set(['http://127.0.0.1:4201']),writes:false,loginContract:'core-bearer-v1'};
  const bff=createApiServer(config); await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve)); config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;
  try {
    const context=await fetch(base+'/bff/auth/context'); const pre=await context.json() as any;
    const initialCookie=context.headers.get('set-cookie')!.split(';')[0];
    const headers={Origin:'http://127.0.0.1:4201',Cookie:initialCookie,'Content-Type':'application/json','X-CSRF-Token':pre.csrfToken};
    const input=JSON.stringify({login:'qa-sintetico',senha:' senha-sintetica '});
    assert.equal((await fetch(base+'/bff/auth/user-login',{method:'POST',headers:{...headers,'X-CSRF-Token':'bad'},body:input})).status,403); assert.equal(calls,0);
    responseMode='false'; assert.equal((await fetch(base+'/bff/auth/user-login',{method:'POST',headers,body:input})).status,401);
    responseMode='unprocessable'; assert.equal((await fetch(base+'/bff/auth/user-login',{method:'POST',headers,body:input})).status,401);
    responseMode='unknown'; assert.equal((await fetch(base+'/bff/auth/user-login',{method:'POST',headers,body:input})).status,502);
    responseMode='ok'; const login=await fetch(base+'/bff/auth/user-login',{method:'POST',headers,body:input}); assert.equal(login.status,200);
    const session=await login.json() as any; assert.equal(session.authenticated,true); assert.equal(session.token,undefined); assert.equal(session.user.senhaHash,undefined);
    const cookie=login.headers.get('set-cookie')!.split(';')[0]; assert.notEqual(cookie,initialCookie);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{headers:{Cookie:cookie}})).status,403);
    const current=await fetch(base+'/bff/auth/user-session',{headers:{Cookie:cookie}}); assert.equal((await current.json() as any).authenticated,true);
    const old=await fetch(base+'/bff/auth/user-session',{headers:{Cookie:initialCookie}}); assert.equal((await old.json() as any).authenticated,false);
    assert.equal((await fetch(base+'/bff/auth/user-logout',{method:'POST',headers:{...headers,Cookie:cookie,'X-CSRF-Token':session.csrfToken},body:'{}'})).status,200);
    const after=await fetch(base+'/bff/auth/user-session',{headers:{Cookie:cookie}}); assert.equal((await after.json() as any).authenticated,false);
  } finally { await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]); }
});
test('concurrent login is rejected and late Core success cannot recreate a logged-out session',async()=>{
  let entered!:()=>void; const started=new Promise<void>(resolve=>entered=resolve);
  let release!:()=>void; const finish=new Promise<void>(resolve=>release=resolve);
  const upstream=createServer(async(req,res)=>{
    for await(const _chunk of req) { /* Consume only synthetic credentials. */ }
    entered(); await finish; res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo'}}));
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,accessKey:'s'.repeat(32),port:0,origins:new Set(['http://127.0.0.1:4201']),writes:false,loginContract:'core-bearer-v1'};
  const bff=createApiServer(config); await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve)); config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;
  try {
    const context=await fetch(base+'/bff/auth/context'); const state=await context.json() as any;
    const headers={Origin:'http://127.0.0.1:4201',Cookie:context.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json','X-CSRF-Token':state.csrfToken};
    const body=JSON.stringify({login:'qa-sintetico',senha:'senha-sintetica'});
    const first=fetch(base+'/bff/auth/user-login',{method:'POST',headers,body});
    await started;
    assert.equal((await fetch(base+'/bff/auth/user-login',{method:'POST',headers,body})).status,409);
    assert.equal((await fetch(base+'/bff/auth/user-logout',{method:'POST',headers,body:'{}'})).status,200);
    release(); const result=await first; assert.equal(result.status,403); assert.equal(result.headers.get('set-cookie'),null);
  } finally { release(); await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]); }
});
test('permission adapter grants no capabilities from profile labels or unknown codes',async()=>{
  const {capabilitiesFor}=await import('../src/authorization.ts');
  assert.deepEqual(capabilitiesFor(['Administrador','precos.view','__proto__','constructor'],true),[]);
  assert.deepEqual(capabilitiesFor(['usuarios.manage'],false),['users.read']);
  assert.deepEqual(capabilitiesFor(['usuarios.manage'],true),['users.read','users.write']);
});
test('Core totalItems pagination is translated without losing records or exposing extra fields',()=>{
  const result=responseBody('/usuarios','GET',{items:[{id:guid,nome:'Pessoa sintética',status:'Ativo',senhaHash:'synthetic-private'}],totalItems:26,pageNumber:2,pageSize:25,totalPages:2},new URLSearchParams({page:'2',pageSize:'25'})) as any;
  assert.equal(result.total,26);assert.equal(result.page,2);assert.equal(result.pageSize,25);
  assert.equal(result.items.length,1);assert.equal(result.items[0].status,'ativo');assert.equal(result.items[0].senhaHash,undefined);
  assert.throws(()=>responseBody('/usuarios','GET',{items:[],totalItems:-1},new URLSearchParams()),{statusCode:502});
});
test('Core-confirmed Administrador sees every read area without gaining unrequested writes',async()=>{
  const {loginIdentity}=await import('../src/core-login.ts');const {capabilitiesFor}=await import('../src/authorization.ts');
  const payload={token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Administrador do Sistema',status:'Ativo',perfis:[{id:guid,nome:'Administrador'}],permissoes:[]}};
  const identity=loginIdentity(payload);
  const capabilities=capabilitiesFor(identity.permissions,false,identity.profiles);
  for(const capability of ['dashboard.read','requests.read','users.read','catalog.read','audit.read','reports.read'])assert.ok(capabilities.includes(capability));
  assert.equal(capabilities.some(value=>value.endsWith('.write')),false);
  assert.equal(capabilitiesFor([],true,identity.profiles).some(value=>value.endsWith('.write')),false);
  const ordinary=loginIdentity({...payload,usuario:{...payload.usuario,perfis:[]}});
  assert.deepEqual(capabilitiesFor(ordinary.permissions,false,ordinary.profiles),[]);
  assert.throws(()=>loginIdentity({...payload,usuario:{...payload.usuario,perfis:[{nome:7}]}}),{statusCode:502});
});
test('demonstration access report supports search, pagination and detail with explicit synthetic provenance',async()=>{
  const {mockAccessReport}=await import('../src/mock-access-report.ts');
  const page=mockAccessReport('/relatorios/acessos',new URLSearchParams({page:'1',pageSize:'2'})) as any;
  assert.equal(page.dataMode,'mock');assert.equal(page.total,3);assert.equal(page.items.length,2);
  const filtered=mockAccessReport('/relatorios/acessos',new URLSearchParams({search:'demonstrativo B'})) as any;
  assert.equal(filtered.total,1);assert.equal(filtered.items[0].sistema,'Sistema demonstrativo B');
  assert.equal((mockAccessReport('/relatorios/acessos/demo-sistema-b',new URLSearchParams()) as any).id,'demo-sistema-b');
  assert.throws(()=>mockAccessReport('/relatorios/acessos',new URLSearchParams({pageSize:'101'})),{statusCode:400});
  assert.throws(()=>mockAccessReport('/relatorios/acessos',new URLSearchParams('page=1&page=2')),{statusCode:400});
  assert.throws(()=>mockAccessReport('/relatorios/acessos/unknown',new URLSearchParams()),{statusCode:404});
});
