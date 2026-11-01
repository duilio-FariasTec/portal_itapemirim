import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const port = Number(process.env.ANI_MOCK_IDP_PORT ?? 3335);
const clientId = 'ani-admin-local';
const callback = `http://127.0.0.1:${Number(process.env.ANI_BFF_PORT ?? 3333)}/bff/auth/callback`;
const codes = new Map<string, { subject: string; clientId: string; redirectUri: string; challenge: string; expiresAt: number }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const demoUsername = 'operador.demo';
const demoPassword = 'ani-demo-2026';

function html(res: ServerResponse, status: number, markup: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(markup);
}
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function formBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) { const data = Buffer.from(chunk); length += data.length; if (length > 8192) throw new Error('Formulário grande demais.'); chunks.push(data); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
function page(error = ''): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Identidade ANI · Simulação local</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 18% 55%,#fff7dc 0,transparent 40%),#f7f7f5;color:#202a37;font:15px Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.top{height:72px;padding:0 clamp(20px,8vw,110px);display:flex;align-items:center;gap:12px;background:#fff;border-bottom:1px solid #dce2ea}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:#f2c230;color:#201b0b;font-size:11px;font-weight:850}.brand{font-weight:700;font-size:13px}.badge{margin-left:auto;color:#667085;font-size:11px}.main{min-height:calc(100vh - 120px);display:grid;place-items:center;padding:32px 16px}.card{width:min(100%,440px);padding:32px;border:1px solid #dce2ea;border-radius:14px;background:#fff;box-shadow:0 12px 34px rgb(20 27 38 / 7%)}.eyebrow{margin:0 0 12px;color:#667085;font-size:10px;font-weight:750;letter-spacing:.13em;text-transform:uppercase}h1{margin:0;font-size:25px;letter-spacing:-.5px}.sub{margin:9px 0 22px;color:#667085;font-size:13px;line-height:1.6}.field{margin:15px 0}.field label{display:block;margin-bottom:6px;font-size:12px;font-weight:650}.field input{width:100%;height:43px;padding:0 12px;border:1px solid #dce2ea;border-radius:7px;font:inherit;font-size:13px}.field input:focus{outline:3px solid rgb(242 194 48 / 25%);border-color:#a47f0c}.demo{margin:18px 0;padding:12px 14px;border-left:3px solid #f2c230;border-radius:6px;background:#fff7dc;color:#555044;font-size:11px;line-height:1.7}.demo strong{color:#202a37}.error{margin:0 0 12px;color:#a23b39;font-size:12px}.submit{width:100%;height:43px;border:1px solid #242424;border-radius:7px;background:#242424;color:white;font-size:12px;font-weight:700;cursor:pointer}.submit:hover{background:#171717}.disclaimer{margin:18px 0 0;color:#667085;font-size:10px;line-height:1.6}.flow{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:22px;color:#667085;font-size:10px}.flow b{color:#242424}.flow i{width:22px;height:1px;background:#dce2ea}.foot{padding:16px;text-align:center;color:#667085;font-size:10px}
  </style></head><body><header class="top"><span class="mark">ANI</span><span class="brand">Autorizador · Identidade</span><span class="badge">Simulação local</span></header><main class="main"><section class="card"><p class="eyebrow">Etapa 2 · Provedor de identidade</p><h1>Entrar na sua conta</h1><p class="sub">Esta tela representa o provedor que confirma sua identidade antes de devolver você ao ANI.</p>${error ? `<p class="error" role="alert">${error}</p>` : ''}<form method="post" action="/login"><input type="hidden" name="client_id" value="${clientId}"><input type="hidden" name="redirect_uri" value="${callback}"><input type="hidden" name="state" value="STATE_PLACEHOLDER"><input type="hidden" name="code_challenge" value="CHALLENGE_PLACEHOLDER"><div class="field"><label for="username">Usuário de demonstração</label><input id="username" name="username" autocomplete="username" required value="${demoUsername}"></div><div class="field"><label for="password">Senha de demonstração</label><input id="password" name="password" type="password" autocomplete="current-password" required value="${demoPassword}"></div><div class="demo"><strong>Dados fictícios para esta simulação</strong><br>Usuário: ${demoUsername}<br>Senha: ${demoPassword}<br>Essas credenciais só funcionam neste servidor local. Nunca use sua senha real.</div><button class="submit" type="submit">Entrar e voltar ao ANI</button></form><p class="disclaimer">Esta página é um mock local, não é o Cognito e não valida contas reais. Aqui o provedor recebe a senha; o ANI recebe um código temporário.</p><div class="flow"><b>ANI</b><i></i><b>Identidade</b><i></i>retorno ao BFF</div></section></main><footer class="foot">ANI Autorizador · Ambiente local de demonstração</footer></body></html>`
    .replace('STATE_PLACEHOLDER', '')
    .replace('CHALLENGE_PLACEHOLDER', '');
}
function loginPage(args: { state: string; challenge: string }, error = ''): string {
  return page(error)
    .replace('name="state" value=""', `name="state" value="${args.state}"`)
    .replace('name="code_challenge" value=""', `name="code_challenge" value="${args.challenge}"`);
}
function loginThrottle(key: string): boolean {
  const now = Date.now(); const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) { loginAttempts.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  if (current.count >= 8) return false;
  current.count += 1; return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', mode: 'synthetic-mock' });
  if (req.method === 'GET' && url.pathname === '/authorize') {
    const state = url.searchParams.get('state') ?? '';
    const challenge = url.searchParams.get('code_challenge') ?? '';
    if (url.searchParams.get('client_id') !== clientId || url.searchParams.get('redirect_uri') !== callback || url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256' || !/^[a-zA-Z0-9_-]{20,}$/.test(state) || !/^[a-zA-Z0-9_-]{20,}$/.test(challenge)) return html(res, 400, '<h1>Pedido de autenticação local inválido</h1>');
    return html(res, 200, loginPage({ state, challenge }));
  }
  if (req.method === 'POST' && url.pathname === '/login') {
    const key = req.socket.remoteAddress ?? 'local';
    if (!loginThrottle(key)) return html(res, 429, loginPage({ state: '', challenge: '' }, 'Muitas tentativas. Aguarde um minuto.'));
    let form: URLSearchParams;
    try { form = await formBody(req); } catch { return html(res, 400, '<h1>Formulário inválido</h1>'); }
    const state = form.get('state') ?? ''; const challenge = form.get('code_challenge') ?? '';
    if (form.get('client_id') !== clientId || form.get('redirect_uri') !== callback || !/^[a-zA-Z0-9_-]{20,}$/.test(state) || !/^[a-zA-Z0-9_-]{20,}$/.test(challenge)) return html(res, 400, '<h1>Pedido de autenticação inválido</h1>');
    if (!safeEqual(form.get('username') ?? '', demoUsername) || !safeEqual(form.get('password') ?? '', demoPassword)) return html(res, 401, loginPage({ state, challenge }, 'Usuário ou senha de demonstração incorretos.'));
    const code = randomBytes(32).toString('base64url');
    codes.set(code, { subject: 'demo-admin-sub', clientId, redirectUri: callback, challenge, expiresAt: Date.now() + 120_000 });
    const destination = new URL(callback); destination.searchParams.set('code', code); destination.searchParams.set('state', state);
    res.writeHead(302, { Location: destination.toString(), 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (req.method === 'POST' && url.pathname === '/token') {
    let form: URLSearchParams;
    try { form = await formBody(req); } catch { return json(res, 400, { error: 'invalid_request' }); }
    const code = form.get('code') ?? ''; const grant = codes.get(code);
    codes.delete(code);
    if (!grant || grant.expiresAt < Date.now() || form.get('grant_type') !== 'authorization_code' || form.get('client_id') !== clientId || form.get('redirect_uri') !== grant.redirectUri) return json(res, 400, { error: 'invalid_grant' });
    const verifier = form.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (!safeEqual(challenge, grant.challenge)) return json(res, 400, { error: 'invalid_grant' });
    return json(res, 200, { access_token: `mock-${randomBytes(24).toString('base64url')}`, token_type: 'Bearer', expires_in: 300, sub: grant.subject });
  }
  json(res, 404, { title: 'Not found', status: 404 });
});

if (process.env.NODE_ENV !== 'development' || !['127.0.0.1', 'localhost'].includes(process.env.ANI_MOCK_IDP_BIND ?? '127.0.0.1')) throw new Error('O provedor de identidade simulado só pode iniciar em desenvolvimento local.');
server.listen(port, '127.0.0.1', () => console.log(`ANI Mock Identity Provider disponível em http://127.0.0.1:${port}`));
