# Diretrizes, informações recebidas e pendências — ANI

Atualizado em 2026-10-31 com respostas informadas pelo cliente e progresso do workspace local Angular/BFF mock. São registros de entendimento; decisões técnicas formais devem ser registradas em `decisoes/` com responsável e data.

## Informações confirmadas/indicadas pelo cliente

| Tema | Entendimento recebido | O que ainda falta |
|---|---|---|
| Repositório e governança | Repositório chamado `fariasTEc` no GitHub; o próprio time responde por negócio, segurança, plataforma e operação; sem padrões preexistentes | URL, organização, nome exato, acesso e associação ao workspace; responsáveis nominais |
| Arquitetura de aplicação | Angular → BFF em Node.js → ANI Core em C# com SQL Server | Framework Node, fronteiras e responsabilidades do BFF, comunicação BFF-Core, versões e contratos |
| Consumidores e identidade | Intranet é o primeiro consumidor; login/autorização serão reutilizados por várias aplicações | Protocolo e fluxo multiaplicação, registro de clientes, integração e autorização por aplicação |
| Credenciais e perfis | Sem IdP corporativo externo por enquanto; login e senha centralizados no ANI; perfil por pessoa com permissões associadas | Decidir ANI como provedor próprio ou serviço gerenciado; sessão/SSO, armazenamento seguro, recuperação, bloqueio, MFA, abuso, expiração, provisionamento, logout e administração |
| Papéis/funções | Admin, Consulta e Manutenção (TI) foram citados; áreas definirão permissões | Matriz formal por ação/recurso, escopo, segregação, delegação e efetividade; confirmar se são perfis definitivos |
| CRUD/GET | Intenção de permitir todas as operações | Quem pode cada operação e sob quais invariantes; filtros, ordenação, paginação e limites |
| Alçadas | Nenhuma regra conhecida ou prevista no momento | Reabrir somente se negócio trouxer necessidade |
| Dados | Usuários/perfis/permissões devem atender vários sistemas consumidores | Entidade/cadastro de aplicações clientes e escopo de permissões por sistema precisam entrar no modelo; campos, IDs, unicidade, relações, estados, classificação e retenção serão levantados |
| Auditoria | Registrar inclusão, alteração e remoção | Eventos/campos, ator, anteriores/posteriores, origem, resultado, proteção, acesso, armazenamento e retenção |
| Tecnologia | Angular, Node.js no BFF, C# REST no Core e SQL Server | Versões, framework Node, ASP.NET/.NET, EF Core/provider, edição/licença e design system |
| SQL Server | Edição, licença e versão de RDS desconhecidas | Migrations, backup/restauração e acesso operacional |
| AWS | Dev por enquanto e PRD como ambiente futuro | Contas, região, orçamento, rede, saída, endpoints, HA, disponibilidade, RPO/RTO, retenção e alarmes |
| Entrega | CI/CD e IaC serão montados pelo time | Provedor/URL Git, branches, scanners, aprovação, roles OIDC, migração, deploy e rollback |
| Serviços complementares | WAF, ACM, CloudFront/S3, KMS, CloudTrail, endpoints privados, NAT e borda ficam para avaliar | Avaliar necessidade e controles antes de expor serviços ou dados |

## Candidatos que não são contrato

O prefixo `/api/v1`, endpoints, nomes de entidades/campos, estados e exemplos do documento mestre continuam candidatos. Não tratar “todas as operações permitidas” como acesso irrestrito: a autorização deve seguir a matriz que as áreas definirão. Consulte [contrato API inicial](../back-end/docs/contrato-api-inicial.md).

## Próximos itens de decisão

1. Antes das próximas alterações de código, confirmar URL, organização, nome exato e instruções do repositório GitHub e revisar como associar o workspace local existente sem substituir histórico ou controles.
2. Definir ANI como provedor de identidade próprio ou adotar serviço gerenciado; escolher protocolo padrão e fluxo para múltiplas aplicações consumidoras.
3. Se Cognito for aprovado, confirmar redirect de nível superior para Managed Login no domínio ANI; registrar app clients/callbacks exatos e não coletar senha em componente executado na origem do consumidor.
4. Definir provedor/protocolo padrão de identidade (OIDC/OAuth 2.0 a avaliar), fronteira do BFF administrativo e do ANI Core, audience/scopes, troca de código, sessão, revogação e delegação autenticada do sujeito humano do BFF para o Core.
5. Especificar segurança de login e senha antes do primeiro código de autenticação: solução OIDC madura ou gerenciada, hash/armazenamento adequado, recuperação, MFA administrativa, bloqueio/rate limit, sessão, cookies/CSRF e resposta a abuso. Não armazenar senha em texto puro nem criar protocolo proprietário.
6. Obter matriz de permissões por sistema para Admin, Consulta, Manutenção (TI) e demais necessidades.
7. Desenhar modelo de dados incluindo aplicações/clientes e permissões escopadas por aplicação, classificação, retenção e auditoria.
8. Escolher versões suportadas, SQL Server/RDS, processo de migrations e política de backup/restauração.
9. Definir ambientes Dev e PRD, rede/IAM, região/custo, observabilidade, CI/CD, IaC e estratégia de rollout/rollback.
10. Formalizar contratos OpenAPI de autenticação, autorização, administração e consumidores; decidir filtros, paginação, erros, limites e compatibilidade.

Para achados priorizados, limites de confiança e recomendações de verificação, consulte a [revisão de arquitetura e segurança do front/API](../front-end/docs/revisao-arquitetura-seguranca.md). As recomendações ainda precisam ser aprovadas pelo responsável de segurança; a revisão não inspecionou a implementação C#.

### Orientação de trabalho atualizada

- O ANI Core/API está sendo desenvolvido por outro analista. Este workstream prepara Angular e `ani-admin-bff` para os endpoints candidatos já levantados e deve alinhar os detalhes ao OpenAPI que o analista publicar; não reimplementar o Core.
- Recomenda-se avaliar Amazon Cognito User Pools + OIDC Authorization Code com PKCE como IdP gerenciado na AWS. Isso ainda precisa de decisão formal. Ver [arquitetura de identidade e integração](arquitetura-identidade-integracao.md).
- O desenvolvimento inicial pode rodar localmente no Codex com serviços locais, dependências descartáveis e dados sintéticos. Configuração AWS de Dev não bloqueia protótipo nem teste local; User Pool real, recursos AWS, banco compartilhado, deploy e chamadas a serviços reais exigem configuração/escopo autorizados.
- A decomposição sistema × recurso × ação × escopo identifica onde e o que uma concessão permite; a matriz de negócio continua pendente. Exemplos não viram regras automaticamente.

### Estado implementado localmente em 2026-10-31

- `front-end/` contém `ani-login` e `ani-admin`, além de BFF local e mock do ANI Core. Os fluxos usam dados sintéticos em memória; não conectam ao ANI Core C# nem a recursos AWS.
- O formulário de solicitação de acesso percorre Angular → BFF → Core mock, consulta o catálogo mock de sistemas ativos, valida os campos e apresenta o protocolo. Essa jornada não autentica o solicitante nem concede acesso.
- O ANI Admin oferece navegação e manutenção contra o mock. Aprovação/rejeição altera apenas o estado mock da solicitação; o que a aprovação deverá provisionar segue pendente de decisão de negócio.
- As duas aplicações têm layout responsivo. O Admin usa menu lateral móvel e cartões nas listagens estreitas; o ANI Acesso refluí para uma coluna. A revisão visual manual foi feita em viewports de 390 px e 320 px, sem overflow horizontal observado.
- Veja [prontidão da V1](../front-end/docs/prontidao-v1.md) e [passagem para 2026-11-01](../front-end/docs/continuidade-2026-11-01.md) para o escopo, evidências e próximos passos. O front-end local ainda não é uma V1 integrada nem aprovada para produção.
