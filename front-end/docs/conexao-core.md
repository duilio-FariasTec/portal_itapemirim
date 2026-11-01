# BFF de integração ANI Core

**Estado atual (2026-11-01):** integração local login → sessão → Core, com Meu Perfil e troca de senha implementados. Os registros de testes nas seções anteriores são históricos; o fechamento atual está em [continuidade](continuidade-2026-11-01.md). Esta entrega não altera as capacidades de Administrador nem certifica mutações remotas.

O ANI Acesso agora possui caminho de login/senha via BFF e sessão de usuário separada. O retorno Bearer foi fornecido pelo usuário e o login válido foi verificado na tela contra QA autorizado. O contrato padrão é `core-bearer-v1`; `ANI_LOGIN_CONTRACT=disabled` desativa o login. O token fica no BFF. Consulte [levantamento V1 ponta a ponta](v1-login-ponta-a-ponta.md) para evidências e pendências de continuação/erros.

Implementação local de desenvolvimento atualizada em 2026-10-31. O caminho normal `npm run bff:api` executa `src/api-server.ts`, sem inicializar ou usar Core/IdP mock. A demonstração permanece disponível explicitamente em `npm run local:bff` e não participa da integração.

## Executar

1. Em `front-end/bff/ani-admin/`, copie `.env.example` para `.env.local`.
2. Configure `ANI_CORE_BASE_URL` com a origem HTTPS do ambiente autorizado. A URL recebida nesta sessão é `https://po-25bbb3c112ec4ce7ba42aae7c30034a5.ecs.us-east-1.on.aws`; o usuário confirmou nesta sessão que se trata de QA autorizado com conta sintética. Login válido/inválido foi verificado; não foram executadas mutações administrativas remotas.
3. O usuário confirmou em 2026-11-01 que `POST /api/v1/auth/reset-senha` foi publicado na AWS. Mantenha `ANI_CORE_BASE_URL` na origem HTTPS AWS; não troque para `http://localhost:5146`. Essa configuração determina o destino de todas as chamadas Core feitas pelo BFF.
4. Configure `ANI_LOGIN_FRONTEND_URL=http://127.0.0.1:4201/` e `ANI_ADMIN_FRONTEND_URL=http://127.0.0.1:4200/`. Os destinos precisam pertencer às origens permitidas. Não há chave para entrar no Admin; arquivos `.env.local` permanecem ignorados pelo Git.
5. Em `front-end/`, execute `npm run bff:api`, `npm run start:login` e `npm run start:admin`. Abra `http://127.0.0.1:4200/`: sem sessão, o Admin encaminha ao Login em `4201`. Digite login/senha; após sucesso clique em “Continuar para administração”. O token permanece no BFF. Não é necessário iniciar mocks.
6. O padrão permite somente leitura. `ANI_BFF_ENABLE_WRITES=true` habilita operações administrativas de escrita. Para o cadastro público direto de conta, configure separadamente `ANI_BFF_ENABLE_PUBLIC_REGISTRATION=true`; isso só libera `POST /usuarios` com nome, e-mail (também usado como login) e senha, exige sessão prévia/CSRF e não habilita as escritas do Admin. Ative apenas em ambiente autorizado para testes com dados sintéticos. Reinicie o BFF após alterar configuração. O BFF não realiza retries automáticos de mutações.

O modo API obtém o Bearer no login do Core e o encaminha servidor a servidor. Não há forwarding de Authorization/cookies fornecidos pelo navegador. O acesso técnico por chave foi removido. O BFF exige sessão criada pelo login do Core e encaminha o Bearer obtido pelo servidor em cada chamada administrativa. O navegador não fornece Authorization nem escolhe ator. A efetividade da validação/autorização dentro do Core continua sujeita a revisão.

## Controles implementados

- Servidor permitido somente em `development/test`, escuta em `127.0.0.1`; origens de browser limitadas a loopback e Host validado. Configuração falha na inicialização se destino, chave, porta ou origens forem inválidos.
- Sessão opaca aleatória em cookie `HttpOnly`, `SameSite=Strict`, `Path=/bff`, expiração absoluta de 30 minutos e ociosa de 15 minutos, rotação no acesso e destruição no logout. Limite de 100 sessões, limpeza das expiradas a cada requisição. Cookie sem `Secure` exclusivamente para HTTP local; não publicar este servidor.
- Limite de oito tentativas de login por minuto e 240 requisições/minuto. Origin e Fetch Metadata verificados; pré-login e mutações exigem CSRF por sessão. Sem CORS permissivo.
- Recuperação de senha exige contexto pré-login/CSRF, valida e limita o e-mail, permite somente `POST /api/v1/auth/reset-senha` no Core e limita a cinco solicitações por minuto por origem de rede no BFF. O BFF envia somente o e-mail, não repassa erros textuais do Core e retorna mensagem genérica para evitar revelar se a conta existe.
- Cadastro público desligado por padrão e controlado por `ANI_BFF_ENABLE_PUBLIC_REGISTRATION`; quando habilitado, aceita somente `POST /usuarios`, exige contexto anônimo com CSRF e limita a três tentativas por minuto por sessão. A API recebe nome, login igual ao e-mail, e-mail e senha, sem `status`; o endpoint é chamado sem Authorization de operador. Dados, senha e resposta sensível não são registrados ou repassados ao browser.
- Allowlist explícita de métodos/rotas e UUIDs; sem proxy aberto, destino escolhido pelo browser ou redirecionamento upstream. HTTPS remoto obrigatório; HTTP aceito somente para Core em loopback.
- Corpo JSON limitado a 32 KiB; DTOs rejeitam campos desconhecidos, tipos e identificadores inválidos. Perfil traduz `status` para `ativo`. Campos `sistemaId`/`escopo` não são descartados silenciosamente.
- Timeout de cinco segundos por chamada Core, resposta de leitura limitada a dois MB, máximo de oito chamadas simultâneas. Nenhum retry automático.
- Respostas projetadas para campos permitidos; senhas, hashes e propriedades desconhecidas não são repassados. Erros upstream são sanitizados. Logs operacionais registram somente evento, status e correlação, sem corpo, query, chave, cookie ou dados pessoais.
- Health verifica o processo, não promete disponibilidade do Core. Sem endpoint de diagnóstico que exponha configuração ou segredos.

## Contrato BFF

Prefixo do browser: `/bff/api/v1`. Prefixo do Core: `/api/v1`.

| Domínio | Operações encaminhadas |
|---|---|
| Perfil próprio | GET `/me` consulta `/usuarios/{guidDaSessao}`; não aceita identificador escolhido pelo navegador |
| Acessos próprios | GET `/me/acessos` consulta perfis e permissões efetivas do GUID da sessão; 403/404 usa dados da sessão com `origem: sessao`, 401 encerra a sessão e demais falhas são propagadas |
| Troca de senha | POST `/auth/trocar-senha` recebe somente `senhaAtual` e `novaSenha`; BFF preenche `usuario`, `login` e `email` e chama a rota Core homônima |
| Usuários | GET/POST `/usuarios`; GET/PUT/DELETE `/usuarios/{uuid}`. O POST público de auto cadastro é opt-in por `ANI_BFF_ENABLE_PUBLIC_REGISTRATION`; demais mutações seguem `ANI_BFF_ENABLE_WRITES` e capacidades |
| Sistemas | GET/POST `/sistemas`; GET/PUT `/sistemas/{guid}`; GET `/sistemas/codigo/{codigo}`. DELETE não encaminhado até confirmar semântica |
| Perfis de usuário | GET/POST `/usuarios/{uuid}/perfis`; DELETE `/usuarios/{uuid}/perfis/{perfilUuid}` |
| Permissões efetivas | GET `/usuarios/{uuid}/permissoes-efetivas` |
| Perfis | GET/POST `/perfis`; GET/PUT/DELETE `/perfis/{uuid}` |
| Permissões de perfil | GET/POST `/perfis/{uuid}/permissoes`; DELETE `/perfis/{uuid}/permissoes/{permissaoUuid}` |
| Permissões | GET/POST `/permissoes`; GET/PUT/DELETE `/permissoes/{uuid}` |
| Auditoria | GET `/auditoria`; GET `/auditoria/{uuid}` |

Sessão do Admin: GET `/bff/session`, POST `/bff/auth/logout`. A entrada ocorre por GET `/bff/auth/context` e POST `/bff/auth/user-login`; a antiga `/bff/auth/integration` retorna 404. Cookie `ani_user_session_v2` tem Path `/bff`, para que o Admin e Login locais compartilhem a mesma sessão no BFF.

O BFF traduz `page/pageSize/search/status/perfilId` para os parâmetros documentados de usuários. Auditoria suporta `page/pageSize/atorUsuarioId/acao/entidade/resultado/dataInicioUtc/dataFimUtc/correlationId`; o status da tela é traduzido para `Resultado`, e a busca genérica não é exibida porque o contrato não define um filtro equivalente. Filtros desconhecidos/duplicados/conflitantes são rejeitados.

Perfis/permissões não têm paginação publicada: o BFF recebe coleção limitada a dois MB, filtra por busca/status e pagina localmente. Perfis também encaminham `sistemaId` da tela como `sistemaGuid` do Core; os filtros de status são traduzidos para `apenasAtivos` e `apenasAtivas`, inclusive quando o valor é inativo. Isso pode exigir evolução do contrato para grandes volumes. Resposta pública de lista é `{items,total,page,pageSize}`; relações usam `{items}`; permissões efetivas usam `{usuarioId,permissoes}`.

## Adaptação de resposta e pendências de validação

O OpenAPI v1 atualizado foi baixado para [ani-core-openapi-v1.json](ani-core-openapi-v1.json) em 2026-11-01. Ele declara GET/POST `/sistemas`, GET/PUT/DELETE `/sistemas/{guid}` e GET `/sistemas/codigo/{codigo}`. Os DTOs de criação e atualização aceitam `codigo`, `nome`, `descricao` e `ativo`, sem campos obrigatórios declarados. Respostas continuam sem schemas publicados e o documento não declara `securitySchemes`; isso não comprova que o Core dispense autenticação. A resposta fornecida para GET de coleção contém `id`, `codigo`, `nome`, `descricao`, `ativo`, `criadoEmUtc` e `atualizadoEmUtc`; o BFF converte `ativo` em status e normaliza a lista para `{items,total,page,pageSize}`. Busca e paginação são aplicadas localmente pelo BFF.

A tela usa listagem, detalhe por GUID, criação e atualização. O BFF permite POST/PUT somente com a capacidade `catalog.write` e `ANI_BFF_ENABLE_WRITES=true`; ambos continuam desabilitados por padrão. Embora o OpenAPI publique DELETE, seu significado (exclusão física ou lógica), resposta e efeitos relacionados não estão descritos. Por isso, o BFF e a UI mantêm DELETE bloqueado. Nenhuma escrita remota foi executada durante a integração.

Sucessos de escrita retornam somente `{ok:true}` ou 204; a UI administrativa recarrega o recurso pelo GET. O cadastro público trata `{ok:true}` como confirmação de criação, sem exibir resposta do Core. O BFF valida os campos declarados no Swagger, mas não substitui validação, autorização, auditoria ou regras de negócio do servidor Core.

A UI ajusta os formulários de perfil/permissão aos campos publicados. O formulário de perfil envia `sistemaId` para criação e edição e oferece filtro de sistema por meio do parâmetro `sistemaGuid` do Core. `escopo` não faz parte dos requests de permissão e não é enviado. O cadastro público cria conta via `POST /usuarios`, envia login igual ao e-mail e senha confirmada; não envia sistema, justificativa ou status, e informa que a conta não recebe acesso a sistemas/perfis. O cadastro público permanece desligado por padrão. O botão de inativar na UI integrada é bloqueado até confirmar se DELETE significa exclusão ou inativação; a rota BFF DELETE está implementada e só é acessível com escritas habilitadas. Não prometer preservação de histórico sem contrato.

## Fluxos administrativos ainda ausentes no contrato recebido

- Fila/decisão de acesso: GET/POST `/solicitacoes-cadastro`, GET `/solicitacoes-cadastro/{id}`, POST `/solicitacoes-cadastro/{id}/aprovar` e POST `/solicitacoes-cadastro/{id}/rejeitar`. O Login atual não usa essas rotas: cria uma conta diretamente via `POST /usuarios` quando explicitamente habilitado.
- Relatório: GET `/relatorios/acessos`.

Esses domínios retornam 501 no modo API para sessão válida, sem fallback mock. O envio público continua indisponível: ele não deve ser trocado por POST administrativo de usuário. Também faltam contratos de provisionamento após aprovação, duplicidade e comprovação de posse de e-mail.

## Verificação e limites de release

`npm --prefix bff/ani-admin test` executa testes de allowlist, validação, projeção de dados, autenticação local, CSRF, modo somente leitura, escrita e logout contra Core HTTP sintético em loopback, além de bloqueio de redirects. Eles não acessam AWS. Os resultados da execução são relatados no fechamento da alteração.

Execução desta entrega: onze testes BFF passaram; três testes do Admin e cinco testes do Login passaram; checagem TypeScript do Admin e build de desenvolvimento do Admin passaram; build de produção do ANI Acesso passou. A build de produção do Admin continua bloqueada pelo orçamento CSS: `app.scss` gerou 16,59 kB, acima de `maximumError=12kB`. A compilação sob sandbox abortou com `Abort trap: 6`; executada fora dele, chegou ao erro explícito de orçamento CSS. Os limites não foram aumentados. Os testes HTTP exigiram permissão para escutar somente em loopback.

O login no QA autorizado já foi exercitado na tela. Para QA dos demais domínios, validar seus schemas reais e cenários com dados sintéticos. Antes de produção, implantar identidade confiável do operador, autorização efetiva e auditoria no Core, sessão compartilhada, HTTPS/cookies Secure, controles distribuídos e infraestrutura aprovada. O servidor bloqueia NODE_ENV=production deliberadamente; esta entrega é integração local, não autenticação de produção.

## Correção do acesso ao Admin

A entrada técnica por chave foi removida, inclusive sua configuração. O fluxo normal usa a identidade autenticada no Core. `usuarios.manage` concede as capacidades de usuários; com escritas desabilitadas, somente `users.read`. A permissão `home.view` identifica o painel; permissões desconhecidas e nomes de perfil não concedem acesso. O QA atual devolve permissões como objetos: o adaptador extrai apenas `codigo` (também aceita a forma anterior com strings). Outros domínios exigem códigos explícitos reconhecidos no adaptador `authorization.ts`; não há fallback por nome Administrador. O Core permanece responsável por aplicar as permissões e escopos nas próprias operações.

## Correção da listagem de usuários

O GET `/api/v1/usuarios` do QA foi consultado com Bearer do usuário e retorna `{items,totalItems,pageNumber,pageSize,totalPages}`. O BFF agora traduz `totalItems` para `total`, preservando a paginação do front. O defeito anterior era incompatibilidade desse campo, que causava 502 apesar de HTTP 200 do Core. Status conhecidos são normalizados para minúsculas. No navegador, a consulta retornou cinco linhas, sem erro; nenhuma mutação administrativa foi realizada. A tela distingue falha de consulta de lista vazia, inclusive após fechar o banner de erro. Regressão: 12 testes BFF e 4 testes Admin. Evidência sem dados pessoais das linhas: [listagem corrigida](../../outputs/qa-login/usuarios-listagem-corrigida.jpg).

## Regra solicitada: navegação completa do Administrador

Por solicitação explícita do usuário, o perfil `Administrador` recebido no login do Core concede capacidades de leitura/navegação para todas as áreas: visão geral, solicitações, usuários, sistemas, perfis, permissões, auditoria e relatórios. O nome de exibição da pessoa não concede acesso; o perfil é extraído de `usuario.perfis[].nome` no retorno HTTPS do Core (ou strings na serialização anterior). Os dados continuam sendo consultados com o Bearer do usuário; não há bypass de autorização no Core.

Essa regra não concede novas escritas. Escritas continuam exigindo permissão explícita e `ANI_BFF_ENABLE_WRITES=true`; o exemplo permanece desligado por padrão e a configuração local não deve ser publicada. Módulos cujos endpoints não existem continuam acessíveis na navegação e informam indisponibilidade. O BFF foi reiniciado, foi feito novo login da conta sintética autorizada e os oito menus foram confirmados no navegador. Evidência: `outputs/qa-login/admin-todos-menus.jpg`. Verificações históricas: 13 testes BFF e 5 testes Admin passaram.

O pedido posterior de acesso total para Administrador está **pendente**. `catalog.write` precisa constar nas permissões reconhecidas para criar/editar Sistemas, Perfis e Permissões. Confirmar o escopo de administrador global e os códigos no Core; não elevar privilégios somente pelo nome de um perfil escopado a sistema.

## Cadastro administrativo e senha própria

O POST administrativo `/usuarios` gera a senha inicial no BFF por `initialPassword`, usando primeiro nome em minúsculas e sufixo `1234`; rejeita senha enviada pelo navegador. Essa implementação existente é previsível e depende de revisão de política antes de produção. Não altera contas antigas e não garante login nem troca obrigatória no primeiro acesso. O cadastro público é outro fluxo e mantém senha escolhida pela pessoa.

Trocar senha exige sessão, CSRF, escritas habilitadas, limites de entrada, concorrência e até cinco tentativas por minuto por sessão. O BFF envia `usuario` como GUID da sessão e busca login/e-mail no próprio registro. Confirmar a semântica desses campos, a política do Core e a validade da sessão após troca. Testes com Core sintético não substituem uma troca real autorizada; não incluir senhas ou tokens em evidências.

## Relatório demonstrativo restaurado por solicitação do usuário

Apenas `GET /bff/api/v1/relatorios/acessos` e o detalhe dos registros demonstrativos são atendidos por `mock-access-report.ts`. O conjunto é fixo e sintético: três sistemas fictícios com contagens de demonstração. Não é agregado a partir de dados reais nem ativado automaticamente por falha do Core. Mantém sessão de login real e exige `reports.read`; outros domínios continuam usando a API real e sua autorização. O relatório não permite mutações.

A lista informa `dataMode=mock`, e a tela exibe “Relatório demonstrativo” e “Dados sintéticos de demonstração”. A exportação CSV identifica dados sintéticos no nome do arquivo. Busca, paginação, detalhe e validação de parâmetros são locais. O endpoint real no Core continua pendente; não apresentar estes números como métricas do QA.

Verificações: 14 testes BFF e 6 testes Admin passaram. No navegador, o relatório carregou os três registros sintéticos sem erro. Evidência: `outputs/qa-login/relatorio-demonstrativo.jpg`.
