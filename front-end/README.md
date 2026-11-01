# ANI · Front-end e BFF

Workspace com duas aplicações Angular e um BFF Node.js/TypeScript. O fluxo atual é **login/senha → BFF → Core**, com token no servidor e sessão opaca no navegador.

> O modo integrado é local, conectado ao QA autorizado. Relatórios utilizam demonstração explícita; sistemas e solicitações dependem de endpoints ainda ausentes. A entrega ainda não está pronta para produção.

## Experiências e responsabilidades

| Aplicação | Papel | Porta |
|---|---|---|
| `ani-login` | Login, sessão, retorno da autenticação e solicitação de cadastro | 4201 |
| `ani-admin` | Administração de usuários, sistemas, perfis, permissões, solicitações, auditoria e relatórios | 4200 |
| BFF | Sessão, CSRF, validação e comunicação com o Core | 3333 |

Ambos os apps chamam `/bff` por proxy local. O navegador não chama o Core diretamente. O cookie de sessão é compartilhado pelo fluxo local; estado de interface e serviços pertencem a cada aplicação.

## Estrutura implementada

```text
apps/
├── ani-login/src/app/
│   ├── core/
│   │   ├── login.service.ts            # Contexto, login, sessão e logout
│   │   └── access-request.service.ts   # Catálogo e pedido de cadastro
│   └── app.{ts,html,scss}              # Telas e estado da experiência de acesso
└── ani-admin/src/app/
    ├── core/
    │   ├── api/admin-api.service.ts    # Cliente HTTP do BFF
    │   └── auth/                      # Sessão, guarda e armazenamento CSRF
    └── app.{ts,html,scss}              # Shell, navegação e telas administrativas
libs/
├── api-contracts/src/index.ts          # Tipos compartilhados
└── design-tokens/src/theme.scss        # Tokens visuais
bff/ani-admin/src/
├── api-server.ts                       # Servidor integrado e rotas permitidas
├── core-client.ts                      # Transporte HTTP para o Core
├── core-login.ts                       # Login e validação do retorno
├── login-routes.ts                     # Ciclo de sessão e login
├── authorization.ts                    # Capacidades da interface
├── contracts.ts                        # Validação e projeção dos DTOs
├── mock-access-report.ts               # Relatório sintético identificado
└── server.ts                           # Servidor da demonstração isolada
```

### Escolhas do front-end

- **Angular standalone e TypeScript:** dois projetos no mesmo workspace, com configuração e builds próprios.
- **Serviços por aplicação:** `HttpClient` concentra o acesso ao BFF; as telas não recebem Bearer tokens.
- **Tipos compartilhados:** `libs/api-contracts` define contratos em evolução; não são clientes gerados de um OpenAPI completo.
- **SCSS e tokens semânticos:** base visual comum para acesso e administração.
- **Responsividade:** sidebar no desktop, menu móvel com backdrop e Escape, tabelas convertidas em cartões e formulários adaptáveis.
- **Estados explícitos:** carregamento, erro e ausência de registros são distintos; o relatório demonstrativo tem identificação própria.

As telas ainda estão concentradas nos componentes raiz. Extrair shell, componentes de apresentação e features por domínio é uma evolução a planejar. `app.routes.ts` está vazio nos dois apps; não há rotas por domínio implementadas. As estruturas propostas nos documentos de arquitetura não representam integralmente a árvore atual.

## Executar com a API

Requisitos: Node.js **>=24.15 e <25**, npm **11+**.

Neste diretório:

```bash
npm ci
cp bff/ani-admin/.env.example bff/ani-admin/.env.local
```

Edite `.env.local` com a origem HTTPS autorizada em `ANI_CORE_BASE_URL`. O arquivo configura os destinos locais dos apps e mantém `ANI_BFF_ENABLE_WRITES=false`. Não coloque credenciais no código nem comite esse arquivo.

Abra três terminais neste diretório:

```bash
npm run bff:api
```

```bash
npm run start:login
```

```bash
npm run start:admin
```

1. Acesse http://127.0.0.1:4200.
2. Sem sessão, o Admin encaminha a http://127.0.0.1:4201.
3. Informe as credenciais sintéticas autorizadas para QA.
4. Após sucesso, clique em **Continuar para administração**.
5. **Sair** encerra a sessão e retorna ao Login.

Não é necessário iniciar os mocks nesse fluxo. Reinicie o BFF após alterar sua configuração. Não há chave de integração local na entrada do Admin.

## Fluxo de autenticação

```mermaid
sequenceDiagram
    participant L as ANI Acesso
    participant B as BFF
    participant C as Core
    participant A as ANI Admin
    L->>B: Login e senha + CSRF
    B->>C: POST /api/v1/auth/login
    C-->>B: Bearer, validade e usuário
    B-->>L: Cookie HttpOnly e resultado mínimo
    Note over L,A: Usuário continua para a administração
    A->>B: GET /bff/session
    B-->>A: Identidade e capacidades de UI
    A->>B: Consulta administrativa
    B->>C: Chamada com Bearer do usuário
    C-->>B: Dados autorizados
    B-->>A: DTO adaptado
```

O perfil `Administrador` confirmado pelo Core libera leitura/navegação em todas as áreas. Não é inferido pelo nome da pessoa. Escritas exigem permissão explícita e habilitação no BFF; a API continua responsável por autorizar cada operação.

## Integração e limites funcionais

| Área | Implementação e limite |
|---|---|
| Autenticação | Login válido/inválido, sessão e logout exercitados no QA autorizado |
| Usuários | Listagem integrada; normalização de paginação `totalItems` e status |
| Perfis e permissões | Rotas de consulta e escrita implementadas; homologação dos fluxos pendente |
| Auditoria | Rotas de consulta implementadas; validação funcional completa pendente |
| Sistemas/portais | Endpoints `/api/v1/portais` ausentes no OpenAPI analisado |
| Cadastro e aprovação | Endpoints `/api/v1/solicitacoes-cadastro` e decisões ausentes; envio público indisponível |
| Relatórios | Mock explícito com três registros sintéticos e CSV identificado |
| Escritas | Desabilitadas por padrão; nenhuma mutação administrativa remota foi validada |

Não existe fallback geral para mocks quando o Core falha. Sistemas e solicitações continuam informando indisponibilidade. A inativação pela UI permanece bloqueada até confirmar a semântica de DELETE no Core.

## Segurança e fronteira de produção

O BFF aplica allowlist de métodos e rotas, validação de DTOs, origens e Host, CSRF, limites de requisição e concorrência, timeout, bloqueio de redirects e projeção de respostas. O Bearer fica em memória no servidor; o navegador usa cookie `HttpOnly`, `SameSite=Strict`, com expiração e encerramento no logout. Erros não repassam corpos sensíveis do Core.

A execução é restrita a `development/test` e loopback. O cookie sem `Secure` atende somente HTTP local. Produção requer revisão de identidade, autorização e auditoria do Core, sessão compartilhada, HTTPS, cookies seguros, limites distribuídos e infraestrutura aprovada. Cognito/OIDC é uma proposta documentada, não o mecanismo em execução.

## Demonstração isolada

Para explorar a demonstração sintética, inicie os serviços abaixo **no lugar de `bff:api`**, além dos dois apps Angular:

```bash
npm run local:core
npm run local:idp
npm run local:bff
```

Core mock utiliza a porta 3334; IdP mock, 3335; BFF mock, 3333. Os dados são voláteis em memória. O fluxo simulado de identidade do Admin é separado do login/senha integrado; o endpoint de login de usuário não está disponível nesse modo. Aprovação mock altera status e não provisiona usuário real.

## Comandos de desenvolvimento

| Comando | Finalidade |
|---|---|
| `npm run start:admin` | Admin em 4200 |
| `npm run start:login` | Acesso em 4201 |
| `npm run bff:api` | BFF integrado em 3333 |
| `npm run build:admin` / `npm run build:login` | Build de produção de cada app |
| `npm run build` | Build de produção dos dois apps |
| `npm test` | Testes Angular dos dois apps |
| `npm --prefix bff/ani-admin test` | Testes BFF com serviços sintéticos locais |

**Limitação conhecida:** o último build de produção do Admin registrado excedeu o orçamento CSS do componente (`16,59 kB` para limite de `12 kB`). O limite não foi aumentado. Esse bloqueio e as pendências funcionais precisam ser resolvidos antes do release.

## Próximos passos para V1

1. Completar contratos de resposta e erros do Core e validar adaptadores por domínio.
2. Disponibilizar endpoints de sistemas, solicitações/aprovação e relatório real.
3. Definir provisionamento, duplicidade, verificação de e-mail e semântica de inativação.
4. Validar escritas autorizadas, permissões, sessão e cenários de falha com dados sintéticos.
5. Resolver orçamento CSS, revisar acessibilidade e concluir QA responsivo.
6. Planejar extração de componentes e features sem alterar as regras de acesso.

## Leituras de apoio

- [Conexão ao Core e contrato BFF](docs/conexao-core.md)
- [Levantamento V1 de login ponta a ponta](docs/v1-login-ponta-a-ponta.md)
- [Arquitetura UI e design system](docs/arquitetura-ui-design-system.md)
- [Prontidão V1](docs/prontidao-v1.md)
- [Arquitetura geral e propostas](../docs/arquitetura-ani.md)
- [Segurança e limites](../seguranca/README.md)

Os documentos de arquitetura incluem propostas e registros históricos. Este guia descreve a estrutura executável atual; contratos, infraestrutura e funcionalidades pendentes não são apresentados como homologados.
