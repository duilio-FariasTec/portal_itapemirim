import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApiServer, configuration } from '../src/api-server.ts';
import { assertCoreRoute, coreQuery, coreDestination, callCore } from '../src/core-client.ts';
import { initialPassword, requestBody, responseBody } from '../src/contracts.ts';

const guid = '11111111-1111-1111-1111-111111111111';
test('allowlist enforces methods, UUIDs and unavailable domains', () => {
  assertCoreRoute('GET', '/usuarios');
  assertCoreRoute('GET', '/sistemas');
  assertCoreRoute('GET', `/sistemas/${guid}`);
  assertCoreRoute('POST', '/sistemas');
  assertCoreRoute('PUT', `/sistemas/${guid}`);
  assert.throws(() => assertCoreRoute('DELETE', `/sistemas/${guid}`),{statusCode:501});
  assertCoreRoute('POST', `/usuarios/${guid}/perfis`);
  assertCoreRoute('DELETE', `/perfis/${guid}/permissoes/${guid}`);
  for (const [method, path] of [['GET','/auth/login'], ['PATCH',`/usuarios/${guid}`], ['GET','/usuarios/invalid'], ['POST',`/auditoria/${guid}`]]) assert.throws(() => assertCoreRoute(method, path));
  assert.throws(() => assertCoreRoute('GET','/portais'), {statusCode:501});
});
test('query translation validates limits, duplicates and unsupported filters', () => {
  assert.equal(coreQuery('/usuarios',new URLSearchParams({page:'2',pageSize:'25',search:'Sintetico'})).toString(),'PageNumber=2&PageSize=25&Busca=Sintetico');
  assert.equal(coreQuery(`/usuarios/${guid}`,new URLSearchParams()).toString(),'');
  assert.throws(() => coreQuery(`/usuarios/${guid}`,new URLSearchParams({search:'Pessoa'})),{statusCode:400});
  assert.equal(coreQuery('/sistemas',new URLSearchParams({page:'1',pageSize:'100',search:'Portal',status:'ativo'})).toString(),'apenasAtivos=true');
  assert.equal(coreQuery('/sistemas',new URLSearchParams({status:'inativo'})).toString(),'apenasAtivos=false');
  assert.throws(() => coreQuery('/sistemas',new URLSearchParams({status:'ativo',apenasAtivos:'false'})),{statusCode:400});
  assert.equal(coreQuery('/perfis',new URLSearchParams({page:'2',pageSize:'25',search:'Teste',status:'inativo',sistemaId:guid})).toString(),`apenasAtivos=false&sistemaGuid=${guid}`);
  assert.equal(coreQuery('/perfis',new URLSearchParams({status:'ativo'})).toString(),'apenasAtivos=true');
  assert.equal(coreQuery('/permissoes',new URLSearchParams({status:'inativo'})).toString(),'apenasAtivas=false');
  assert.throws(() => coreQuery('/perfis',new URLSearchParams({sistemaId:'inválido'})),{statusCode:400});
  assert.equal(coreQuery('/auditoria',new URLSearchParams({page:'1',pageSize:'25',status:'negado'})).toString(),'PageNumber=1&PageSize=25&Resultado=negado');
  assert.throws(() => coreQuery('/auditoria',new URLSearchParams({status:'negado',resultado:'sucesso'})),{statusCode:400});
  for (const q of ['page=0','pageSize=101','page=1&page=2','sort=nome']) assert.throws(() => coreQuery('/usuarios',new URLSearchParams(q)), {statusCode:400});
  assert.throws(() => coreDestination('http://remote.example.invalid'));
  assert.throws(() => coreDestination('https://remote.example.invalid/?token=x'));
});
test('write DTOs reject mass assignment, validate profile systems and protect immutable login', () => {
  assert.deepEqual(requestBody('/sistemas','POST',{codigo:'SISTEMA_TESTE',nome:'Sistema sintético',descricao:'Teste',status:'ativo'}),{codigo:'SISTEMA_TESTE',nome:'Sistema sintético',descricao:'Teste',ativo:true});
  assert.deepEqual(requestBody(`/sistemas/${guid}`,'PUT',{codigo:'SISTEMA_TESTE',nome:'Sistema sintético',ativo:false}),{codigo:'SISTEMA_TESTE',nome:'Sistema sintético',ativo:false});
  assert.throws(() => requestBody('/sistemas','POST',{codigo:'SISTEMA_TESTE',nome:'Sistema sintético',ativo:true,extra:'não permitido'}),{statusCode:422});
  assert.deepEqual(requestBody('/perfis','POST',{nome:'Teste',sistemaId:guid,status:'ativo'}),{nome:'Teste',sistemaId:guid,ativo:true});
  assert.throws(() => requestBody('/perfis','POST',{nome:'Teste',status:'ativo'}),{statusCode:400});
  assert.deepEqual(requestBody(`/perfis/${guid}`,'PUT',{nome:'Teste atualizado',sistemaId:null,status:'ativo'}),{nome:'Teste atualizado',sistemaId:null,ativo:true});
  assert.deepEqual(requestBody('/usuarios','POST',{nome:'Pessoa sintética',email:'teste@example.invalid'}),{nome:'Pessoa sintética',email:'teste@example.invalid'});
  assert.throws(() => requestBody(`/usuarios/${guid}`,'PUT',{nome:'Teste',email:'teste@example.invalid',login:'novo'}),{statusCode:422});
  assert.throws(() => requestBody(`/usuarios/${guid}/perfis`,'POST',{perfilId:'bad'}),{statusCode:400});
});
test('administrative registration derives the initial password from the first name', () => {
  assert.equal(initialPassword('  Pessoa Sintética Teste '),'pessoa1234');
  assert.equal(initialPassword('ÉRICA'),'érica1234');
  assert.throws(() => initialPassword('   '),{statusCode:400});
});
test('response projection removes secrets and paginates bounded catalogs', () => {
  const result = responseBody('/perfis','GET',[{guid,nome:'Teste',ativo:true,senha:'sintetica',senhaHash:'hash-sintetico'}],new URLSearchParams({page:'1',pageSize:'25'})) as any;
  assert.equal(result.items[0].id,guid); assert.equal(result.items[0].status,'ativo');
  assert.equal(result.items[0].senha,undefined); assert.equal(result.items[0].senhaHash,undefined);
  const profile=responseBody('/perfis','GET',[{guid,nome:'Teste',sistemaGuid:guid,sistema:{nome:'Sistema sintético'},ativo:true}],new URLSearchParams({page:'1',pageSize:'25'})) as any;
  assert.equal(profile.items[0].sistemaId,guid); assert.equal(profile.items[0].sistemaNome,'Sistema sintético');
  assert.throws(() => responseBody('/usuarios','GET',[],new URLSearchParams()),{statusCode:502});
  assert.throws(() => responseBody('/usuarios','GET',{unexpected:[]},new URLSearchParams()),{statusCode:502});
  const systems=responseBody('/sistemas','GET',[{id:guid,codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Catálogo de teste',ativo:true,criadoEmUtc:'2026-01-01T00:00:00Z'}],new URLSearchParams({page:'1',pageSize:'25',status:'ativo'})) as any;
  assert.equal(systems.total,1);
  assert.equal(systems.items[0].codigo,'SISTEMA_SINTETICO');
  assert.equal(systems.items[0].status,'ativo');
  assert.equal(systems.items[0].criadoEmUtc,'2026-01-01T00:00:00Z');
});
test('configuration requires local trusted destinations without a shared-key login', () => {
  const env = {NODE_ENV:'test',ANI_CORE_BASE_URL:'https://api.example.invalid',ANI_BFF_ACCESS_KEY:'x'.repeat(32)};
  assert.equal(configuration(env).writes,false);
  assert.equal(configuration(env).publicRegistration,false);
  assert.equal(configuration({...env,ANI_BFF_ENABLE_PUBLIC_REGISTRATION:'true'}).publicRegistration,true);
  assert.throws(() => configuration({...env,NODE_ENV:'production'}));
  assert.equal(configuration({...env,ANI_BFF_ACCESS_KEY:''}).port,3333);
  assert.throws(()=>configuration({...env,ANI_LOGIN_FRONTEND_URL:'https://evil.example.invalid/'}));
  assert.throws(() => configuration({...env,ANI_ALLOWED_ORIGINS:'https://browser.example.invalid'}));
});
test('public registration requires its own gate and anonymous CSRF session, and forwards only approved fields',async()=>{
  let received: Record<string,unknown>|undefined;
  const upstream=createServer(async(req,res)=>{
    assert.equal(req.method,'POST');assert.equal(req.url,'/api/v1/usuarios');
    assert.equal(req.headers.authorization,undefined);
    let raw='';for await(const chunk of req)raw+=chunk;
    received=JSON.parse(raw);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({id:guid,senhaHash:'hash-sintetico'}));
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,port:0,origins:new Set(['http://127.0.0.1:4201']),writes:false,publicRegistration:true};
  const bff=createApiServer(config);await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve));config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;const origin='http://127.0.0.1:4201';
  try{
    const bootstrap=await fetch(base+'/bff/auth/context');const context=await bootstrap.json() as any;const cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
    assert.equal(context.registrationEnabled,true);
    const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':context.csrfToken};
    const input={nome:'Pessoa sintética',login:'pessoa@example.invalid',email:'pessoa@example.invalid',senha:'senha-sintetica'};
    config.publicRegistration=false;
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify(input)})).status,403);
    config.publicRegistration=true;
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers:{...headers,'X-CSRF-Token':'inválido'},body:JSON.stringify(input)})).status,403);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({...input,status:'ativo'})})).status,422);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({...input,login:'outro-login'})})).status,400);
    for(let index=0;index<3;index++) {
      const response=await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify(input)});
      assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
    }
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify(input)})).status,429);
    assert.deepEqual(received,input);
  }finally{await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]);}
});
test('password reset requires pre-login CSRF, validates email and forwards only the email to Core',async()=>{
  let received: Record<string,unknown>|undefined;
  const upstream=createServer(async(req,res)=>{
    assert.equal(req.method,'POST');assert.equal(req.url,'/api/v1/auth/reset-senha');
    assert.equal(req.headers.authorization,undefined);
    let raw='';for await(const chunk of req)raw+=chunk;
    received=JSON.parse(raw);
    if(received.email==='falha@example.invalid') {
      res.statusCode=400;res.setHeader('Content-Type','application/problem+json');
      res.end(JSON.stringify({title:'Conta inexistente'}));return;
    }
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      mensagem:'Se as informações informadas corresponderem a uma conta ativa, você receberá um e-mail com as instruções e a senha temporária de acesso.',
      processadoEmUtc:'2026-11-01T17:15:18.167395Z',
    }));
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,port:0,origins:new Set(['http://127.0.0.1:4201']),writes:false};
  const bff=createApiServer(config);await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve));config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;const origin='http://127.0.0.1:4201';
  try{
    const bootstrap=await fetch(base+'/bff/auth/context');const context=await bootstrap.json() as any;const cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
    const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':context.csrfToken};
    assert.equal((await fetch(base+'/bff/auth/password-reset',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'pessoa@example.invalid'})})).status,403);
    assert.equal((await fetch(base+'/bff/auth/password-reset',{method:'POST',headers,body:JSON.stringify({email:'nao-e-email'})})).status,400);
    assert.equal((await fetch(base+'/bff/auth/password-reset',{method:'POST',headers,body:JSON.stringify({email:'pessoa@example.invalid',senha:'nao-permitida'})})).status,400);
    const response=await fetch(base+'/bff/auth/password-reset',{method:'POST',headers,body:JSON.stringify({email:'pessoa@example.invalid'})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{
      mensagem:'Se as informações informadas corresponderem a uma conta ativa, você receberá um e-mail com as instruções e a senha temporária de acesso.',
      processadoEmUtc:'2026-11-01T17:15:18.167395Z',
    });
    assert.deepEqual(received,{email:'pessoa@example.invalid'});
    const failure=await fetch(base+'/bff/auth/password-reset',{method:'POST',headers,body:JSON.stringify({email:'falha@example.invalid'})});
    assert.equal(failure.status,502);
    const sanitized=await failure.json() as any;
    assert.equal(sanitized.title,'Recuperação temporariamente indisponível');
    assert.equal(JSON.stringify(sanitized).includes('Conta inexistente'),false);
  }finally{await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]);}
});
test('real HTTP transport and BFF: authentication, CSRF, read-only default, DTOs, logout and no mock fallback', async () => {
  const calls: string[] = [];
  const upstream = createServer(async (req,res) => {
    if(req.url==='/api/v1/auth/login') {
      for await(const _chunk of req) {}
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo',permissoes:[{codigo:'home.view',nome:'Não usado para autorização'},{codigo:'usuarios.manage',nome:'Não usado para autorização'},{codigo:'catalog.read',nome:'Não usado para autorização'},{codigo:'catalog.write',nome:'Não usado para autorização'}]}}));return;
    }
    calls.push(`${req.method} ${req.url}`);
    if(req.url?.startsWith('/api/v1/sistemas?')) {
      assert.ok(req.headers.authorization === undefined || req.headers.authorization === 'Bearer '+'qa-token-sintetico'.repeat(3));
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify([{id:guid,codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Catálogo de teste',ativo:true,criadoEmUtc:'2026-01-01T00:00:00Z',atualizadoEmUtc:null}]));
      return;
    }
    assert.equal(req.headers.authorization,'Bearer '+'qa-token-sintetico'.repeat(3));
    res.setHeader('Content-Type','application/json');
    if(req.url===`/api/v1/sistemas/${guid}`&&req.method==='GET') {
      res.end(JSON.stringify({id:guid,codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Catálogo de teste',ativo:true,criadoEmUtc:'2026-01-01T00:00:00Z',atualizadoEmUtc:null}));
      return;
    }
    if(req.url==='/api/v1/sistemas'&&['POST','PUT'].includes(req.method??'')) {
      let raw=''; for await(const chunk of req) raw+=chunk;
      const body=JSON.parse(raw);
      assert.equal(body.codigo,'SISTEMA_SINTETICO');
      assert.equal(typeof body.ativo,'boolean');
      res.end(JSON.stringify({id:guid,codigo:body.codigo,nome:body.nome,descricao:body.descricao,ativo:body.ativo,criadoEmUtc:'2026-01-01T00:00:00Z',atualizadoEmUtc:'2026-01-02T00:00:00Z'}));
      return;
    }
    if (req.method === 'POST') { res.end('{"guid":"'+guid+'","senhaHash":"sintetico"}'); return; }
    res.end(JSON.stringify({items:[{guid,nome:'Pessoa sintética',email:'qa@example.invalid',status:'ativo',senhaHash:'sintetico'}],totalCount:1}));
  });
  await new Promise<void>(resolve => upstream.listen(0,'127.0.0.1',resolve));
  const config = {baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,accessKey:'s'.repeat(32),port:0,origins:new Set(['http://127.0.0.1:4200','http://127.0.0.1:4201']),writes:false};
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
    assert.equal((await fetch(base+'/bff/api/v1/sistemas?status=inativo')).status,401);
    const publicSystems=await fetch(base+'/bff/api/v1/sistemas?page=1&pageSize=100&status=ativo');
    assert.equal(publicSystems.status,200);
    const publicPage=await publicSystems.json() as any;
    assert.equal(publicPage.items[0].codigo,'SISTEMA_SINTETICO');
    assert.equal(calls[1],'GET /api/v1/sistemas?apenasAtivos=true');
    const systemDetail=await fetch(base+`/bff/api/v1/sistemas/${guid}`,{headers});
    assert.equal(systemDetail.status,200);
    assert.equal((await systemDetail.json() as any).status,'ativo');
    const adminState=await fetch(base+'/bff/session',{headers});const view=await adminState.json() as any;
    assert.equal(view.authMode,'core');assert.equal(view.user.id,guid);assert.deepEqual(view.capabilities,['dashboard.read','users.read','catalog.read']);
    assert.equal(view.authorization,undefined);
    assert.equal((await fetch(base+'/bff/api/v1/perfis',{headers})).status,200);
    assert.equal((await fetch(base+'/bff/api/v1/relatorios/acessos',{headers})).status,403);
    assert.equal((await fetch(base+'/bff/api/v1/portais',{headers})).status,501);
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:'{}'})).status,403);
    assert.equal((await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers,body:JSON.stringify({senhaAtual:'sintetica',novaSenha:'sintetica'})})).status,403);
    config.writes = true;
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers:{...headers,'X-CSRF-Token':'invalid'},body:'{}'})).status,403);
    const write = await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({nome:'Pessoa sintética',email:'qa@example.invalid',login:'qa'})});
    assert.equal(write.status,200); assert.deepEqual(await write.json(),{ok:true});
    const createSystem=await fetch(base+'/bff/api/v1/sistemas',{method:'POST',headers,body:JSON.stringify({codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Teste',status:'ativo'})});
    assert.equal(createSystem.status,200); assert.deepEqual(await createSystem.json(),{ok:true});
    const updateSystem=await fetch(base+`/bff/api/v1/sistemas/${guid}`,{method:'PUT',headers,body:JSON.stringify({codigo:'SISTEMA_SINTETICO',nome:'Sistema sintético',descricao:'Atualizado',status:'inativo'})});
    assert.equal(updateSystem.status,200); assert.deepEqual(await updateSystem.json(),{ok:true});
    assert.equal((await fetch(base+`/bff/api/v1/sistemas/${guid}`,{method:'DELETE',headers})).status,501);
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
test('self profile and password change use only the authenticated user GUID and API profile fields',async()=>{
  const passwordRequests: Record<string,unknown>[]=[];
  const upstream=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/v1/auth/login'&&req.method==='POST') {
      res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo'}}));
      return;
    }
    if(req.url===`/api/v1/usuarios/${guid}`&&req.method==='GET') {
      assert.equal(req.headers.authorization,`Bearer ${'qa-token-sintetico'.repeat(3)}`);
      res.end(JSON.stringify({guid,nome:'Pessoa sintética',login:'pessoa.demo',email:'pessoa@example.invalid',status:'Ativo',senhaHash:'nao-deve-ser-projetado'}));
      return;
    }
    if(req.url==='/api/v1/auth/trocar-senha'&&req.method==='POST') {
      assert.equal(req.headers.authorization,`Bearer ${'qa-token-sintetico'.repeat(3)}`);
      let raw='';for await(const chunk of req)raw+=chunk;
      passwordRequests.push(JSON.parse(raw));
      res.statusCode=204;res.end();return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,port:0,origins:new Set(['http://127.0.0.1:4200']),writes:true,loginContract:'core-bearer-v1'};
  const bff=createApiServer(config);await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve));config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;const origin='http://127.0.0.1:4200';
  try{
    const context=await fetch(base+'/bff/auth/context');const initial=await context.json() as any;const initialCookie=context.headers.get('set-cookie')!.split(';')[0];
    const login=await fetch(base+'/bff/auth/user-login',{method:'POST',headers:{Origin:origin,Cookie:initialCookie,'Content-Type':'application/json','X-CSRF-Token':initial.csrfToken},body:JSON.stringify({login:'pessoa.demo',senha:'senha-sintetica'})});
    assert.equal(login.status,200);const session=await login.json() as any;const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken};
    const profile=await fetch(base+'/bff/api/v1/me',{headers});assert.equal(profile.status,200);
    assert.deepEqual(await profile.json(),{guid,id:guid,nome:'Pessoa sintética',login:'pessoa.demo',email:'pessoa@example.invalid',status:'ativo'});
    const passwordBody={senhaAtual:'senha-atual-sintetica',novaSenha:'senha-nova-sintetica'};
    assert.equal((await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(passwordBody)})).status,403);
    const changed=await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers,body:JSON.stringify({...passwordBody,login:'outro-usuario'})});
    assert.equal(changed.status,400);assert.equal(passwordRequests.length,0);
    const result=await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers,body:JSON.stringify(passwordBody)});
    assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true});
    assert.deepEqual(passwordRequests,[{usuario:guid,senhaAtual:'senha-atual-sintetica',novaSenha:'senha-nova-sintetica',login:'pessoa.demo',email:'pessoa@example.invalid'}]);
    for(let i=0;i<4;i++)assert.equal((await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers,body:JSON.stringify(passwordBody)})).status,200);
    assert.equal((await fetch(base+'/bff/api/v1/auth/trocar-senha',{method:'POST',headers,body:JSON.stringify(passwordBody)})).status,429);
    assert.equal(passwordRequests.length,5);
  }finally{await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]);}
});
test('administrative user registration sends the derived initial password and rejects a client-supplied one',async()=>{
  const created: Record<string,unknown>[]=[];
  const upstream=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/v1/auth/login'&&req.method==='POST') {
      res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo',permissoes:[{codigo:'users.write',nome:'Gerenciar usuários'}]}}));
      return;
    }
    if(req.url==='/api/v1/usuarios'&&req.method==='POST') {
      let raw='';for await(const chunk of req)raw+=chunk;
      const parsed=JSON.parse(raw);
      if(parsed.nome==='Rejeitada'){res.statusCode=400;res.end(JSON.stringify({title:'x',errors:{Senha:['valor sensivel nao repassado'],'<script>':['x']}}));return;}
      created.push(parsed);
      res.statusCode=201;res.end(JSON.stringify({guid}));return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,port:0,origins:new Set(['http://127.0.0.1:4200']),writes:true,loginContract:'core-bearer-v1'};
  const bff=createApiServer(config);await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve));config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;const origin='http://127.0.0.1:4200';
  try{
    const context=await fetch(base+'/bff/auth/context');const initial=await context.json() as any;const initialCookie=context.headers.get('set-cookie')!.split(';')[0];
    const login=await fetch(base+'/bff/auth/user-login',{method:'POST',headers:{Origin:origin,Cookie:initialCookie,'Content-Type':'application/json','X-CSRF-Token':initial.csrfToken},body:JSON.stringify({login:'pessoa.demo',senha:'senha-sintetica'})});
    assert.equal(login.status,200);const session=await login.json() as any;const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrfToken};
    const user={nome:'Pessoa Sintética Teste',email:'nova@example.invalid',login:'nova@example.invalid',status:'ativo'};
    assert.equal((await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({...user,senha:'escolhida-pelo-cliente'})})).status,422);
    assert.equal(created.length,0);
    const result=await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify(user)});
    assert.equal(result.status,201);assert.deepEqual(await result.json(),{ok:true});
    assert.deepEqual(created,[{...user,senha:'pessoa1234'}]);
    const rejected=await fetch(base+'/bff/api/v1/usuarios',{method:'POST',headers,body:JSON.stringify({...user,nome:'Rejeitada'})});
    assert.equal(rejected.status,400);const problem=await rejected.json() as any;
    assert.equal(problem.title,'Operação recusada pela API ANI (campos: Senha)');
  }finally{await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]);}
});
test('self access summary uses only the session GUID and falls back to login claims when Core denies relation reads',async()=>{
  let relationStatus=200;const relationPaths:string[]=[];
  const upstream=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/v1/auth/login'&&req.method==='POST') {
      res.end(JSON.stringify({token:'qa-token-sintetico'.repeat(3),tokenType:'Bearer',expiresInSeconds:3600,usuario:{id:guid,nome:'Pessoa sintética',status:'Ativo',perfis:[{nome:'Consulta sintética'}],permissoes:[{codigo:'usuarios.view'}]}}));
      return;
    }
    if(req.url===`/api/v1/usuarios/${guid}/perfis`||req.url===`/api/v1/usuarios/${guid}/permissoes-efetivas`) {
      relationPaths.push(req.url);
      if(relationStatus!==200){res.statusCode=relationStatus;res.end('{}');return;}
      res.end(JSON.stringify(req.url.endsWith('/perfis')
        ?[{guid:'22222222-2222-4222-8222-222222222222',nome:'Consulta sintética',sistema:{nome:'Sistema sintético'},ativo:true,segredo:'nao-projetar'}]
        :{permissoes:[{guid:'33333333-3333-4333-8333-333333333333',nome:'Ver usuários',recurso:'usuarios',acao:'ler',escopo:'global'}]}));
      return;
    }
    res.statusCode=404;res.end();
  });
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const config={baseUrl:`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,port:0,origins:new Set(['http://127.0.0.1:4200']),writes:false,loginContract:'core-bearer-v1'};
  const bff=createApiServer(config);await new Promise<void>(resolve=>bff.listen(0,'127.0.0.1',resolve));config.port=(bff.address() as AddressInfo).port;
  const base=`http://127.0.0.1:${config.port}`;const origin='http://127.0.0.1:4200';
  try{
    assert.equal((await fetch(base+'/bff/api/v1/me/acessos')).status,401);
    const context=await fetch(base+'/bff/auth/context');const initial=await context.json() as any;const initialCookie=context.headers.get('set-cookie')!.split(';')[0];
    const login=await fetch(base+'/bff/auth/user-login',{method:'POST',headers:{Origin:origin,Cookie:initialCookie,'Content-Type':'application/json','X-CSRF-Token':initial.csrfToken},body:JSON.stringify({login:'pessoa.demo',senha:'senha-sintetica'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(base+`/bff/api/v1/me/acessos?usuario=${guid}`,{headers:{Cookie:cookie}})).status,400);
    const fromApi=await fetch(base+'/bff/api/v1/me/acessos',{headers:{Cookie:cookie}});assert.equal(fromApi.status,200);
    assert.deepEqual(await fromApi.json(),{origem:'api',perfis:[{guid:'22222222-2222-4222-8222-222222222222',id:'22222222-2222-4222-8222-222222222222',nome:'Consulta sintética',sistemaNome:'Sistema sintético',ativo:true,status:'ativo'}],permissoes:[{guid:'33333333-3333-4333-8333-333333333333',id:'33333333-3333-4333-8333-333333333333',nome:'Ver usuários',recurso:'usuarios',acao:'ler',escopo:'global'}]});
    relationStatus=403;
    const fromSession=await fetch(base+'/bff/api/v1/me/acessos',{headers:{Cookie:cookie}});assert.equal(fromSession.status,200);
    assert.deepEqual(await fromSession.json(),{origem:'sessao',perfis:[{nome:'Consulta sintética'}],permissoes:[{codigo:'usuarios.view',nome:'usuarios.view'}]});
    relationStatus=500;
    assert.equal((await fetch(base+'/bff/api/v1/me/acessos',{headers:{Cookie:cookie}})).status,502);
    assert.ok(relationPaths.every(path=>path.startsWith(`/api/v1/usuarios/${guid}/`)));
  }finally{await Promise.all([new Promise<void>(resolve=>bff.close(()=>resolve())),new Promise<void>(resolve=>upstream.close(()=>resolve()))]);}
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
