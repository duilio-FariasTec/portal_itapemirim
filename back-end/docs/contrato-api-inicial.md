# Contrato inicial candidato da API

**Estado: proposta para discussão; não aprovada.** Nenhum endpoint, nome, campo, status, filtro ou regra abaixo deve ser considerado contrato implementável sem revisão de negócio, segurança e consumidores. Prefixo candidato: `/api/v1`.

## Recursos e operações sugeridos

| Recurso | Rotas candidatas no documento mestre | Observações pendentes |
|---|---|---|
| Usuários | `GET /usuarios`, `GET /usuarios/{id}`, `POST /usuarios`, `PUT /usuarios/{id}`, `PATCH /usuarios/{id}/status`, `GET /usuarios/{id}/permissoes` | Identidade externa, provisionamento, estados, campos, escopo, regras de leitura/escrita e exclusão |
| Portais | `GET /portais`, `GET /portais/{id}`, `POST /portais`, `PUT /portais/{id}`, `PATCH /portais/{id}/status` | Cadastro, identificadores, configuração de integração, administração e estados |
| Perfis | `GET /perfis`, `GET /perfis/{id}`, `POST /perfis`, `PUT /perfis/{id}` | Escopo, vigência, atribuição, mutabilidade e exclusão |
| Permissões | `GET /permissoes`, `GET /perfis/{id}/permissoes`, `POST /perfis/{id}/permissoes` | Catálogo, recurso/ação, vínculos, vigência e autorização |
| Identidade do ator | `GET /me`, `GET /me/portals`, `GET /me/permissions` | Significado de “me”, audiência e identidade depende do IdP e consumidor |
| Autorização/alçada | `POST /autorizacoes/consultar`, `POST /autorizacoes/consultar-alcada` | Entrada contextual, regras, resposta e alçada não definidos; não implementar ainda |
| Auditoria | `GET /auditoria`, `GET /auditoria/{id}` | Acesso restrito, campos, retenção e requisitos legais a definir |

Rotas candidatas são apresentadas como recebidas; decidir idioma, convenções, nomes e compatibilidade antes de fechar OpenAPI. Exemplos de limite monetário no documento mestre são ilustrativos e não representam regra empresarial.

## Padrões para discussão

- Listas podem precisar de paginação, filtros e ordenação, todos explicitamente permitidos e limitados.
- Definir semântica de `PUT` versus `PATCH`, concorrência, idempotência, validação, `Location`, remoção lógica/física e estados antes da implementação.
- Padronizar erros (Problem Details é uma opção), correlation ID e códigos HTTP, sem detalhes internos ou dados sensíveis.
- O cliente indicou login e senha sem IdP corporativo nesta etapa; o fluxo de credenciais e sessão ainda precisa de especificação. Exigir autorização no ANI Core por operação e recurso, inclusive leituras. BFF e interface não substituem controles do servidor.
- Escritas relevantes devem gerar auditoria conforme esquema, acesso e retenção aprovados.
- Definir compatibilidade, versionamento/depreciação e contrato dos portais consumidores.

## Exemplo estrutural sem dados reais

```http
GET /api/v1/usuarios?page=1&pageSize=25
Authorization: Bearer <token omitido>
```

Esse exemplo não aprova a rota, os parâmetros nem o formato da resposta. Antes de implementar, revisar OpenAPI completo, identidade, autorização, modelo de dados, limites, filtros, erros, concorrência, auditoria e consumidores.

## Solicitação e aprovação de cadastro — adição proposta

O fluxo de telas solicitado inclui envio de solicitação e análise/autorização administrativa. Essas operações não constavam da lista inicial. As rotas abaixo são candidatas para discussão e precisam de aprovação antes de integrar o front:

| Operação candidata | Rota | Acesso/decisões pendentes |
|---|---|---|
| Criar solicitação | `POST /api/v1/solicitacoes-cadastro` | Definir se anônima ou autenticada, campos, validação, prevenção a abuso e resposta segura |
| Listar solicitações | `GET /api/v1/solicitacoes-cadastro` | Restrita a responsáveis autorizados; definir filtros, paginação e estados |
| Consultar solicitação | `GET /api/v1/solicitacoes-cadastro/{id}` | Definir visibilidade para solicitante e aprovador |
| Aprovar | `POST /api/v1/solicitacoes-cadastro/{id}/aprovar` | Definir autorização, transição, perfil inicial e se cria/ativa usuário |
| Rejeitar | `POST /api/v1/solicitacoes-cadastro/{id}/rejeitar` | Definir autorização, justificativa, transição e notificação |

Definir status e transições, duplicidade, vínculo com usuário, prazo/retenção, trilha de auditoria e notificações. Aprovação e rejeição devem ser autorizadas no ANI Core e auditadas. Não presumir que `POST /api/v1/usuarios` cria solicitação pendente: na proposta existente, representa criação de usuário.

## Autenticação para várias aplicações — decisão necessária

O ANI será reutilizado como login/controle por várias aplicações. Os endpoints de cadastro, usuários, perfis e permissões deste rascunho não definem um protocolo de identidade multiaplicação. `POST /api/sessao/login` e rotas de sessão do BFF administrativo também não bastam, por si só, para esse propósito.

Definir ANI como provedor OIDC/OAuth 2.0 próprio ou adotar serviço gerenciado; registrar cada aplicação cliente e aprovar redirecionamentos, escopos, claims, tokens, logout, descoberta, chaves e validação. Preferir fluxos padrão em vez de compartilhar formulário/senha entre sistemas. Não criar endpoints proprietários de autenticação até fechar essa decisão e seus controles.

Orientação técnica atual para discussão: [Amazon Cognito User Pools + OIDC Authorization Code/PKCE](../../docs/arquitetura-identidade-integracao.md). O Core deverá validar access tokens e aplicar autorização empresarial; Cognito não substitui a matriz de acesso ANI.
