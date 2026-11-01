# ANI Front-end e BFF local

O ANI Acesso agora autentica por login/senha → BFF → Core QA autorizado, com Bearer token mantido no servidor e sessão opaca no browser. O login válido foi verificado na tela com a conta sintética autorizada. Configuração e pendências da V1 estão no [levantamento de login V1](docs/v1-login-ponta-a-ponta.md); o destino após o OK e o contrato de erro do Core continuam pendentes.

O BFF de integração real está implementado em `bff/ani-admin/src/api-server.ts`, com transporte HTTP, sessão autenticada por login/senha no Core, CSRF e contratos adaptados. Execute `npm run bff:api` após configurar o ambiente conforme [conexão ao Core](docs/conexao-core.md). O modo é exclusivo para desenvolvimento local; respostas reais e ambiente ainda precisam de confirmação antes de QA integrado. Os comandos abaixo continuam descrevendo a demonstração mock isolada.

Workspace local do front-end ANI: dois aplicativos Angular (`ani-login` e `ani-admin`), contratos TypeScript, tokens de UI, BFF de integração e mocks isolados de Core/identidade. O login integrado foi verificado contra QA autorizado com conta sintética; os demais contratos e regras de produção continuam pendentes. O modo mock usa dados voláteis em memória e não conecta ao Core real. O workspace ainda deve ser associado ao repositório Git oficial após revisão de URL e controles.

## Requisitos

- Node.js 24.15+ (Angular 22)
- npm 11+

## Executar localmente

Instale as dependências uma vez com `npm install`. Abra cinco terminais neste diretório:

1. `npm run local:core` — mock HTTP do Core em `127.0.0.1:3334`.
2. `npm run local:idp` — provedor de identidade simulado em `127.0.0.1:3335`.
3. `npm run local:bff` — BFF local em `127.0.0.1:3333`.
4. `npm run start:login` — ANI Acesso em `http://127.0.0.1:4201`.
5. `npm run start:admin` — ANI Admin em `http://127.0.0.1:4200`.

Os cinco comandos acima executam a demonstração mock. Nela, o login de usuário pela API fica indisponível; a solicitação de acesso continua usando o catálogo sintético. Para login/senha real no QA autorizado, use `npm run bff:api` conforme a documentação de conexão, sem iniciar mocks. O fluxo `/bff/auth/login` do servidor mock continua uma demonstração separada de identidade para o Admin. Use somente dados sintéticos.

## Layout responsivo

- `ani-admin`: sidebar persistente em desktop; em telas até 760 px, navegação por menu lateral com backdrop, fechamento por Escape e foco contido. As tabelas são apresentadas como cartões com campos rotulados em larguras estreitas; filtros, ações, paginação e diálogos refluem para toque.
- `ani-login`: composição em duas colunas em desktop e uma coluna em telas até 760 px; campos mantêm área confortável de toque e evitam zoom automático do navegador em dispositivos móveis.
- A verificação manual mais recente cobriu 390 px no Admin e 320/390 px no ANI Acesso, sem overflow horizontal observado. Isso não substitui validação de acessibilidade completa ou QA.
- A implementação e os pontos pendentes estão em [prontidão V1](docs/prontidao-v1.md) e [arquitetura UI/design system](docs/arquitetura-ui-design-system.md).

## Retomar o trabalho

Para continuar na próxima sessão, comece pela [passagem de continuidade de 2026-11-01](docs/continuidade-2026-11-01.md), que registra o estado atual, as limitações conhecidas e a ordem sugerida de trabalho.

## Scripts

- `npm run build` — compila os dois aplicativos em configuração de produção.
- `npm test` — executa os testes Angular dos dois projetos.
- `npm run local:core`, `npm run local:idp` e `npm run local:bff` — iniciam os serviços simulados locais.

## Limites e próximos contratos

- `libs/api-contracts/src/index.ts` contém tipos candidatos; gerar/validar contra OpenAPI aprovado pelo responsável da API antes de integrar.
- `bff/ani-admin/src/server.ts` aceita somente rotas allowlist e Core local, usa sessão `HttpOnly` e exige CSRF em mutações autenticadas. A lista pública de sistemas ativos expõe somente os dados sintéticos do mock; o envio público valida origem, formato, campos, limites e frequência. O armazenamento em memória é somente para desenvolvimento.
- `bff/mock-ani-core/src/server.ts` mantém dados sintéticos em memória, sem persistência. A criação de solicitação e decisões administrativas geram eventos sintéticos de auditoria; aprovação no mock altera o status apenas e não provisiona usuário nem perfil.
- O `ani-login` envia credenciais somente ao BFF de integração. O BFF consulta o Core e mantém Bearer token no servidor. A caixa antirobô demonstrativa foi removida; o endpoint aplica limites reais e CSRF.
- Na implantação, OIDC Authorization Code + PKCE deve redirecionar ao provedor confiável; a tela Angular não deve coletar senha. A API Core permanece autoridade final para autenticação/autorização de negócio.
- Substituir sessão em memória, rate limit local e cabeçalhos de desenvolvimento por desenho de produção revisto (sessão compartilhada segura, limites distribuídos, HTTPS, cookies Secure, CSP e controles de borda). Não apontar esta implementação local para APIs remotas.

## Estrutura

```text
apps/ani-login/             Experiência de acesso e solicitação de cadastro
apps/ani-admin/             Console administrativo protegido
libs/api-contracts/         Contratos TypeScript provisórios
libs/design-tokens/         Tokens visuais compartilhados
bff/ani-admin/              BFF local com sessão e allowlist
bff/mock-identity-provider/ Provedor de identidade mock para visualizar redirect/código/PKCE
bff/mock-ani-core/          API HTTP sintética em memória
docs/                       Arquitetura, segurança, fluxos e wireframes
```
