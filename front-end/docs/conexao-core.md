# BFF de integração ANI Core

O ANI Acesso agora possui caminho de login/senha via BFF e sessão de usuário separada. O retorno Bearer foi fornecido pelo usuário e o login válido foi verificado na tela contra QA autorizado. O contrato padrão é `core-bearer-v1`; `ANI_LOGIN_CONTRACT=disabled` desativa o login. O token fica no BFF. Consulte [levantamento V1 ponta a ponta](v1-login-ponta-a-ponta.md) para evidências e pendências de continuação/erros.

Implementação local de desenvolvimento atualizada em 2026-10-31. O caminho normal `npm run bff:api` executa `src/api-server.ts`, sem inicializar ou usar Core/IdP mock. A demonstração permanece disponível explicitamente em `npm run local:bff` e não participa da integração.

## Executar

1. Em `front-end/bff/ani-admin/`, copie `.env.example` para `.env.local`.
2. Configure `ANI_CORE_BASE_URL` com a origem HTTPS do ambiente autorizado. A URL recebida nesta sessão é `https://po-25bbb3c112ec4ce7ba42aae7c30034a5.ecs.us-east-1.on.aws`; o usuário confirmou nesta sessão que se trata de QA autorizado com conta sintética. Login válido/inválido foi verificado; não foram executadas mutações administrativas remotas.
3. Configure `ANI_LOGIN_FRONTEND_URL=http://127.0.0.1:4201/` e `ANI_ADMIN_FRONTEND_URL=http://127.0.0.1:4200/`. Os destinos precisam pertencer às origens permitidas. Não há chave para entrar no Admin; arquivos `.env.local` permanecem ignorados pelo Git.
4. Em `front-end/`, execute `npm run bff:api`, `npm run start:login` e `npm run start:admin`. Abra `http://127.0.0.1:4200/`: sem sessão, o Admin encaminha ao Login em `4201`. Digite login/senha; após sucesso clique em “Continuar para administração”. O token permanece no BFF. Não é necessário iniciar mocks.
5. O padrão permite somente leitura. `ANI_BFF_ENABLE_WRITES=true` habilita operações de escrita após confirmação de ambiente autorizado com dados sintéticos. Reinicie o BFF após alterar configuração. O BFF não realiza retries automáticos de mutações.

O modo API obtém o Bearer no login do Core e o encaminha servidor a servidor. Não há forwarding de Authorization/cookies fornecidos pelo navegador. O acesso técnico por chave foi removido. O BFF exige sessão criada pelo login do Core e encaminha o Bearer obtido pelo servidor em cada chamada administrativa. O navegador não fornece Authorization nem escolhe ator. A efetividade da validação/autorização dentro do Core continua sujeita a revisão.

## Controles implementados

- Servidor permitido somente em `development/test`, escuta em `127.0.0.1`; origens de browser limitadas a loopback e Host validado. Configuração falha na inicialização se destino, chave, porta ou origens forem inválidos.
- Sessão opaca aleatória em cookie `HttpOnly`, `SameSite=Strict`, `Path=/bff`, expiração absoluta de 30 minutos e ociosa de 15 minutos, rotação no acesso e destruição no logout. Limite de 100 sessões, limpeza das expiradas a cada requisição. Cookie sem `Secure` exclusivamente para HTTP local; não publicar este servidor.
- Limite de oito tentativas de login por minuto e 240 requisições/minuto. Origin e Fetch Metadata verificados; pré-login e mutações exigem CSRF por sessão. Sem CORS permissivo.
- Allowlist explícita de métodos/rotas e UUIDs; sem proxy aberto, destino escolhido pelo browser ou redirecionamento upstream. HTTPS remoto obrigatório; HTTP aceito somente para Core em loopback.
- Corpo JSON limitado a 32 KiB; DTOs rejeitam campos desconhecidos, tipos e identificadores inválidos. Perfil traduz `status` para `ativo`. Campos `sistemaId`/`escopo` não são descartados silenciosamente.
- Timeout de cinco segundos por chamada Core, resposta de leitura limitada a dois MB, máximo de oito chamadas simultâneas. Nenhum retry automático.
- Respostas projetadas para campos permitidos; senhas, hashes e propriedades desconhecidas não são repassados. Erros upstream são sanitizados. Logs operacionais registram somente evento, status e correlação, sem corpo, query, chave, cookie ou dados pessoais.
- Health verifica o processo, não promete disponibilidade do Core. Sem endpoint de diagnóstico que exponha configuração ou segredos.

## Contrato BFF

Prefixo do browser: `/bff/api/v1`. Prefixo do Core: `/api/v1`.

| Domínio | Operações encaminhadas |
|---|---|
| Usuários | GET/POST `/usuarios`; GET/PUT/DELETE `/usuarios/{uuid}` |
| Perfis de usuário | GET/POST `/usuarios/{uuid}/perfis`; DELETE `/usuarios/{uuid}/perfis/{perfilUuid}` |
| Permissões efetivas | GET `/usuarios/{uuid}/permissoes-efetivas` |
| Perfis | GET/POST `/perfis`; GET/PUT/DELETE `/perfis/{uuid}` |
| Permissões de perfil | GET/POST `/perfis/{uuid}/permissoes`; DELETE `/perfis/{uuid}/permissoes/{permissaoUuid}` |
| Permissões | GET/POST `/permissoes`; GET/PUT/DELETE `/permissoes/{uuid}` |
| Auditoria | GET `/auditoria`; GET `/auditoria/{uuid}` |

Sessão do Admin: GET `/bff/session`, POST `/bff/auth/logout`. A entrada ocorre por GET `/bff/auth/context` e POST `/bff/auth/user-login`; a antiga `/bff/auth/integration` retorna 404. Cookie `ani_user_session_v2` tem Path `/bff`, para que o Admin e Login locais compartilhem a mesma sessão no BFF.

O BFF traduz `page/pageSize/search/status/perfilId` para os parâmetros documentados de usuários. Auditoria suporta `page/pageSize/atorUsuarioId/acao/entidade/resultado/dataInicioUtc/dataFimUtc/correlationId`. Busca genérica ou status genérico em auditoria retornam 400, pois não há correspondência definida. Filtros desconhecidos/duplicados são rejeitados.

Perfis/permissões não têm paginação publicada: o BFF recebe coleção limitada a dois MB, filtra por busca/status e pagina localmente. Isso pode exigir evolução do contrato para grandes volumes. Resposta pública de lista é `{items,total,page,pageSize}`; relações usam `{items}`; permissões efetivas usam `{usuarioId,permissoes}`.

## Adaptação de resposta e pendências de validação

O OpenAPI consultado não declara schemas de resposta. Os adaptadores aceitam coleções como arrays ou `items`, total de lista paginada em `total`/`totalCount`, identificador `id`/`guid` e booleano `ativo` convertido a status. São hipóteses explícitas de compatibilidade verificadas com fixtures sintéticas, **ainda não confirmadas contra respostas do ambiente recebido**. Envelopes desconhecidos retornam 502 em vez de lista vazia ou dados inventados. O analista deve publicar DTOs completos e erros para gerar/alinhar os tipos.

Sucessos de escrita retornam somente `{ok:true}` ou 204; a UI recarrega o recurso pelo GET. O BFF valida os campos declarados no Swagger, mas não substitui validação, autorização, auditoria ou regras de negócio do servidor Core. O formulário não coleta senha de usuário; se a API exigir senha no cadastro, o fluxo de provisionamento precisa ser definido antes de usá-lo.

A UI ajusta os formulários de perfil/permissão aos campos publicados. `sistemaId` e `escopo` não fazem parte desses requests e não são enviados. O botão de inativar na UI integrada é bloqueado até confirmar se DELETE significa exclusão ou inativação; a rota BFF DELETE está implementada e só é acessível com escritas habilitadas. Não prometer preservação de histórico sem contrato.

## Endpoints usados pelo projeto e ausentes no OpenAPI recebido

- Sistemas/portais: GET/POST `/portais`, GET/PUT/DELETE `/portais/{id}`. GET é também necessário ao seletor público de sistemas ativos no ANI Acesso.
- Solicitações: GET/POST `/solicitacoes-cadastro`, GET `/solicitacoes-cadastro/{id}`, POST `/solicitacoes-cadastro/{id}/aprovar` e POST `/solicitacoes-cadastro/{id}/rejeitar`.
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

Essa regra não concede novas escritas. Escritas continuam exigindo permissão explícita e `ANI_BFF_ENABLE_WRITES=true`, que permanece desabilitado nesta instância. Módulos cujos endpoints não existem continuam acessíveis na navegação e informam indisponibilidade. O BFF foi reiniciado, foi feito novo login da conta sintética autorizada e os oito menus foram confirmados no navegador. Evidência: `outputs/qa-login/admin-todos-menus.jpg`. Verificações: 13 testes BFF e 5 testes Admin passaram.

## Relatório demonstrativo restaurado por solicitação do usuário

Apenas `GET /bff/api/v1/relatorios/acessos` e o detalhe dos registros demonstrativos são atendidos por `mock-access-report.ts`. O conjunto é fixo e sintético: três sistemas fictícios com contagens de demonstração. Não é agregado a partir de dados reais nem ativado automaticamente por falha do Core. Mantém sessão de login real e exige `reports.read`; outros domínios continuam usando a API real e sua autorização. O relatório não permite mutações.

A lista informa `dataMode=mock`, e a tela exibe “Relatório demonstrativo” e “Dados sintéticos de demonstração”. A exportação CSV identifica dados sintéticos no nome do arquivo. Busca, paginação, detalhe e validação de parâmetros são locais. O endpoint real no Core continua pendente; não apresentar estes números como métricas do QA.

Verificações: 14 testes BFF e 6 testes Admin passaram. No navegador, o relatório carregou os três registros sintéticos sem erro. Evidência: `outputs/qa-login/relatorio-demonstrativo.jpg`.
