# Avaliação de prontidão para desenvolvimento — ANI

**Data:** 2026-10-31  
**Status geral (atualizado em 2026-10-31):** **o workspace local de UI/BFF mock está implementado e navegável; identidade real, integração com o ANI Core e autorização final continuam pendentes**. O ANI Core está sendo desenvolvido por outro analista conforme informado; este workstream não deve reimplementá-lo. O contrato/OpenAPI implementado ainda precisa ser alinhado. O código do front-end está em `front-end/`, mas a associação ao repositório Git oficial continua pendente. Este parecer é uma revisão documental; não é auditoria de segurança nem autorização para provisionar AWS/deploy.

## Resumo executivo

Há uma separação implementada localmente entre `ani-login`, `ani-admin`, BFF Node.js/TypeScript e Core mock. A arquitetura de produção continua proposta: ANI Core C# e SQL Server devem ser alinhados ao contrato do analista responsável. Fronteiras importantes permanecem: o browser não é autoridade de autorização, o Core deve autorizar cada operação e escopo, e dados/segredos devem ser tratados com cautela.

O escopo deste workstream é chegar até o BFF e o front-end, consumindo os endpoints levantados. O desenvolvimento pode avançar localmente contra mocks/schemas e depois contra o OpenAPI da API entregue pelo outro analista. O repositório `fariasTEc` foi citado, mas URL, projeto Angular/BFF e estrutura exata ainda não foram associados. A arquitetura de identidade AWS precisa de decisão; o contrato implementado da API e a matriz de autorização seguem por alinhar.

## Avaliação por área

| Área | Situação | Parecer |
|---|---|---|
| Arquitetura de aplicação e camadas | **Direção coerente; proposta** | Separar autenticação central, portal administrativo, BFF e Core é adequado ao objetivo. A composição do Core (`Api`, `Application`, `Domain`, `Infrastructure`) é candidata e deve ser ajustada ao código/padrões reais, sem criar camadas vazias. |
| Angular e layout | **Implementados localmente; aprovação visual/acessibilidade pendente** | Os dois apps Angular têm navegação responsiva; Admin usa menu lateral móvel e cartões para dados em telas estreitas. A verificação visual manual cobriu 390 px e 320 px. Ainda faltam associar ao repositório oficial, confirmar marca/assets, versões suportadas e meta formal de acessibilidade. |
| Segurança | **Princípios documentados; controles não verificados** | Há bons requisitos de negação por padrão, autorização server-side, sessão BFF, CSRF, delegação de identidade, proteção contra IDOR e auditoria. Não foi possível provar que a API C# existente aplica esses controles, pois seu código não está neste workspace. |
| Identidade e login multiaplicação | **Recomendação pronta para decisão; integração real pendente** | Recomenda-se Cognito User Pools + OIDC Authorization Code/PKCE; Managed Login hospeda credenciais. Falta decisão formal, configurar app clients/callbacks/scopes e alinhar JWT com Core. UI/BFF podem avançar com contrato adaptável e sessão local simulada isolada. |
| Autorização e regras de negócio | **Bloqueador P0 para operações protegidas** | Admin/Consulta/Manutenção são rótulos iniciais, não uma matriz de permissões. Falta definir sujeito × sistema × recurso × ação × escopo, leituras, exportações, aprovações, elevação de privilégio e revogação. “Todas as operações” não significa acesso irrestrito. |
| Modelo de dados e API | **Baseline candidato informado; alinhar implementação** | Os endpoints/schema levantados são baseline de trabalho conforme orientação do responsável. Como o Core é desenvolvido em paralelo, obter OpenAPI/contratos reais e resolver diferenças; evitar inventar rotas ou tratar rascunho como integração já testada. |
| AWS, operação e entrega | **AWS é destino; não bloqueia trabalho local** | A implementação e testes iniciais podem rodar localmente no Codex com dados sintéticos. Conta/região/IaC/rede/IAM e operação são necessários para User Pool AWS, Dev compartilhado e produção, não para iniciar protótipo e BFF local. |
| Verificação e evidências | **Fluxos e responsividade verificados manualmente no mock local** | Os servidores Angular recompilaram com as últimas alterações. A produção ainda não foi compilada com sucesso: uma execução anterior de `npm run build` terminou em `Abort trap: 6`. Não há aprovação de QA, teste de contrato com o Core, nem verificação de controles de produção. |

## Bloqueios para a primeira implementação integrada

1. **Associar o repositório Angular/BFF correto** e inspecionar estrutura, instruções, versões e scripts; alinhar com o repositório/contrato do Core do outro analista.
2. **Decidir identidade AWS:** avaliar/aprovar Cognito User Pools + OIDC Authorization Code/PKCE, UX do Managed Login, MFA, callbacks, app clients, scopes/audience, sessão e revogação.
3. **Obter o contrato implementado da API** (OpenAPI, payloads, erros, paginação e ambiente local) e mapear o BFF a ele sem alterar a API unilateralmente.
4. **Aprovar matriz mínima de permissões** por sistema, recurso, ação e escopo para as telas/rotas do `ani-admin`; autorização final permanece no Core.
5. **Definir consumidor intranet:** preferir BFF próprio; se SPA pública, formalizar PKCE, tratamento de token em memória e validação/autorização em cada API.
6. **Preparar execução local segura:** Angular/BFF/Core local ou mocks contratuais, banco descartável, dados sintéticos, configuração sem segredos e modo de autenticação simulada impossível de ativar fora de `local`.

## O que pode avançar agora

- Continuar descoberta de requisitos, documentação, wireframes e protótipos não conectados a dados reais.
- Construir localmente Angular e BFF consumindo mocks/schemas dos endpoints candidatos, após localizar o repositório e conferir scripts/dependências.
- Integrar às rotas reais conforme o analista publicar OpenAPI e ambiente local; manter cliente HTTP e adaptação do BFF tipados/versionados.
- Desenvolver UI com sessão simulada apenas em modo local, sem credenciais reais e sem fallback na configuração AWS.
- Preparar User Pool de desenvolvimento depois da decisão/configuração autorizada; AWS Dev não é pré-requisito para começar a UI e o BFF local.

Não devem ser considerados prontos: login federado real, concessão/aprovação com autorização de produção, integração end-to-end sem contrato implementado e deploy. CRUD e telas podem ser construídos localmente, mas controles finais dependem da API.

## Inconsistências e manutenção documental

- A revisão de segurança tinha referência à biblioteca `ui-brand`; alinhada nesta revisão para `design-tokens`, `ui` e `brand-assets`, conforme a arquitetura de UI.
- Ainda há variação entre `sistema`, `portal` e `cliente` na documentação/API. A semântica e o identificador de integração precisam ser padronizados antes do OpenAPI e do schema.
- O mapa visual e wireframes descrevem fluxos e telas, enquanto endpoints e SQL são candidatos. Manter explícito esse estado até aprovação para evitar que protótipo seja confundido com contrato.
- Os exemplos de perfis não são regras aprovadas. A autorização deve usar capacidades/permissões e escopos confirmados, não comparação de nomes de perfil no Angular.

## Critério de saída para começar a primeira fatia integrada

Considerar uma primeira fatia Angular/BFF local pronta após: (a) repositório correto inspecionado; (b) contrato candidato/OpenAPI do Core mapeado; (c) mock ou Core local disponível; (d) teste com dados sintéticos e sem acesso a serviços compartilhados. Para autenticação integrada: acrescentar decisão/configuração OIDC e fluxo de callback. Para validar autorização ponta a ponta: obter evidência de que Core valida token e matriz/escopo em cada endpoint.

Esse critério não equivale a prontidão para produção. PRD exige também revisão operacional e de segurança, evidências de testes, auditoria, recuperação, monitoração, processo de incidentes e aprovação formal.

## Documentos revisados

- `AGENTS.md`, README e contexto do projeto.
- Arquitetura ANI, recomendação de identidade/integração e decisões/pendências.
- Revisão de arquitetura e segurança do front-end/API.
- Arquitetura de UI e Sistema de Design Angular, mapa do front-end, integração API, fluxos administrativos, prontidão V1 e passagem de continuidade de 2026-11-01.
- Contrato API candidato, documentação do back-end/deploy, banco, infraestrutura e estratégia de testes.
