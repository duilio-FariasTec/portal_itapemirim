# Arquitetura proposta — ANI

**Estado:** atualizada em 2026-10-31 com informações recebidas do cliente e o estado do workspace local. O ANI deverá atender várias aplicações consumidoras; a intranet é o primeiro consumidor conhecido. Há um protótipo executável de front-end/BFF/Core mock em `front-end/`. Contratos, protocolo de identidade, controles de autenticação, regras e infraestrutura ainda precisam de detalhamento. Este documento não substitui aprovação formal.

## Objetivo e escopo

O ANI terá uma experiência central de autenticação para várias aplicações e um `ani-admin` Angular para solicitar/aprovar cadastros e manter usuários, perfis, permissões e auditoria. Na recomendação atual, Cognito Managed Login hospedará credenciais/MFA; `ani-login` Angular pode cuidar do contexto e da solicitação de acesso, mas não implementa um protocolo de identidade próprio. Consumidores iniciam OIDC por redirect. Não coletar senha na origem de um sistema consumidor. A intranet é o primeiro consumidor conhecido. O portal administrativo usa Angular → BFF Node.js/TypeScript → ANI Core C# / SQL Server. Cognito centraliza autenticação; ANI Core mantém autorização de negócio. Não há regras de alçada conhecidas ou previstas nesta etapa.

## Componentes de software

Para recomendação detalhada de identidade AWS, OIDC/PKCE, BFF, consumidor sem backend e execução local, consulte [arquitetura de identidade e integração](arquitetura-identidade-integracao.md). A recomendação é Cognito User Pools como candidato gerenciado, sujeita a aprovação; se adotado, a tela de credenciais passa a ser Managed Login e os wireframes Angular devem refletir esse limite.

- **Front-end:** o workspace local contém `ani-login` e `ani-admin` em Angular 22/TypeScript. O portal admin usa BFF; o acesso Angular não chama banco nem Core diretamente. O layout responsivo e os tokens visuais estão implementados como base de protótipo. A versão suportada pela organização, o design system oficial, a acessibilidade alvo e a aprovação final de marca continuam pendentes.
- **BFF:** há um BFF local de demonstração em `front-end/bff/ani-admin/`, Node.js/TypeScript, com sessão mock, CSRF para mutações autenticadas, allowlist e encaminhamento apenas ao Core mock local. Ele não implementa OIDC nem fala com a API C# real. A arquitetura pretendida é um BFF dedicado ao `ani-admin`, separado do Angular e da API, com sessão/callback segundo protocolo aprovado e adaptação das chamadas ao Core. O Core continua autoridade final de autorização. Não se recomenda um BFF ANI universal para sessões de todos os consumidores. Framework e operação de produção ainda precisam ser definidos.
- **ANI Core:** serviço/API REST em C# / ASP.NET Core. Centraliza casos de uso, regras, autorização, persistência e auditoria. A API Core é a autoridade para decisões de autorização e acesso a dados.
- **Camadas sugeridas no Core:** `ANI.Api` (HTTP, middleware e configuração), `ANI.Application` (casos de uso, DTOs e validações), `ANI.Domain` (modelo e regras confirmadas) e `ANI.Infrastructure` (EF Core, SQL Server e integrações). Manter modular; evitar microsserviços prematuros e camadas sem responsabilidade.
- **Persistência:** Microsoft SQL Server. EF Core e provider SQL Server são candidatos técnicos. Em produção AWS, RDS for SQL Server privado é a direção registrada. Versão, edição/licença, esquema, migrations, concorrência e retenção seguem pendentes.
- **Identidade central:** recomenda-se avaliar Cognito User Pools como IdP gerenciado do ANI, com OIDC Authorization Code + PKCE `S256`. Se aprovado, Cognito mantém credenciais, recuperação e MFA; o Core mantém usuários de negócio e autorização, sem senha local. A tela Cognito Managed Login é customizável dentro de limites; não equivale ao wireframe Angular. Não implementar protocolo/tokens próprios nos endpoints CRUD. Registrar clientes/callbacks exatos, `state`/`nonce`, sessão, logout, revogação, proteção contra abuso, chaves e resposta a incidentes.

## Papéis e autorização

O entendimento atual é perfil por pessoa, com permissões associadas ao perfil. Admin, Consulta e Manutenção (TI) foram citados como perfis/funções possíveis, mas ainda não existe matriz aprovada de ações. As áreas de negócio definirão permissões, recursos, escopos, precedência, segregação, delegação e permissões efetivas.

O provedor de identidade ANI autentica a pessoa; o Core calcula/autorizada capacidades por aplicação e por operação. O resultado ao consumidor deve ser vinculado a cliente/audience, código/troca e sessão conforme protocolo padrão aprovado. O `ani-admin-bff` mantém uma sessão web revogável para seu portal e propaga ao Core o sujeito humano em contexto validado; não usar só uma conta técnica nem headers do browser. O Core autoriza cada operação, registro e escopo; a UI apenas melhora navegação. Definir estratégia para revogar sessões/permissões após bloqueio ou alteração de perfil. Guardas Angular, BFF ou tokens não substituem a decisão do Core.

## AWS e limites de rede propostos

Serviços pretendidos: ECS Fargate para ANI Core e `ani-admin-bff` (topologia de execução ainda a escolher), ECR para imagens, ALB para entrada HTTPS, RDS for SQL Server privado, Secrets Manager para segredos de runtime e CloudWatch para logs, métricas e alarmes. O front Angular pode ser servido estaticamente por serviço aprovado. O BFF administrativo e o Core são serviços separados; confirmar conectividade, exposição e implantação. A borda pública deve expor somente superfícies necessárias de identidade/solicitação; rotas administrativas devem ser protegidas por autenticação/autorização e, idealmente, rede privada entre BFF e Core. Serviço e papel IAM com privilégio mínimo. BFFs dos sistemas consumidores pertencem aos respectivos sistemas, salvo decisão organizacional diferente.

O desenho inicial propõe VPC e separação entre sub-redes de entrada, aplicação e dados. Security Groups devem restringir os fluxos aos componentes necessários; o RDS não deve ter acesso público. O encadeamento de tráfego deve refletir a arquitetura com BFF e Core, a definir antes de provisionar. Zonas de disponibilidade, portas, rotas, saída, IPv6, DNS e VPC endpoints dependem dos requisitos.

IAM deve separar roles de execução, runtime e pipeline com privilégio mínimo. CI/CD deve preferir federação OIDC do provedor Git, sem chaves de longa duração. Região, contas, ambientes, criptografia, rotação, HA, RPO/RTO, backups, recuperação e custo ainda não foram definidos. Dev é a prioridade atual; PRD está previsto.

WAF, ACM, CloudFront/S3, KMS, CloudTrail, endpoints privados e NAT ficam para avaliação posterior. A ausência de decisão atual não significa que esses controles sejam desnecessários; avaliar conforme risco e requisitos.

## Modelo de dados e API

O modelo inicial precisa contemplar usuários, perfis, permissões e auditoria, mas campos e relacionamentos serão levantados pelo time. O cliente informou cadastro de usuários pela intranet, perfil por pessoa e permissões associadas ao perfil. Admin, Consulta e Manutenção (TI) ainda não são uma matriz de privilégios aprovada. Campos, IDs, unicidade, estados, escopo, vigência, exclusão lógica/física, histórico, classificação e concorrência exigem decisão.

O cliente deseja permitir operações CRUD e GET, porém os atores e invariantes não estão definidos; “todas permitidas” não deve ser interpretado como acesso irrestrito. `/api/v1` e os recursos descritos no [contrato API candidato](../back-end/docs/contrato-api-inicial.md) ainda são rascunho. Aprovar OpenAPI, matriz de acesso, filtros/paginação/limites, erros, idempotência, concorrência e auditoria antes da integração com o Core real. O protótipo local cobre navegação contra mocks; isso não aprova nem implementa esses contratos. A intranet é o primeiro consumidor conhecido e não tem back-end próprio.

## Auditoria e operação

Foi solicitada auditoria de inclusão, alteração e remoção. Definir ator, horário, entidade, resultado, correlação, conteúdo anterior/posterior, origem, proteção contra alteração, acesso, armazenamento e retenção. Não registrar segredos ou dados pessoais desnecessários. Logs operacionais e trilha de auditoria têm finalidades distintas.

CI/CD e IaC ainda precisam ser estabelecidos. A proposta é revisão de PR, build/testes, análise de dependências e imagens, artefato imutável, deploy em Dev e promoção controlada a PRD, com health checks e rollback. Provedor Git/URL exata, branch protections, scanners, aprovação, migrações e estratégia de rollout seguem pendentes. Nada aqui autoriza deploy ou publicação.

## Referências

- [Contexto recebido](../contexto/README.md)
- [Decisões e pendências](decisoes-e-pendencias.md)
- [Segurança e limites](../seguranca/README.md)
- [Plano de trabalho](../planos/README.md)
- [Revisão de arquitetura e segurança do front/API](../front-end/docs/revisao-arquitetura-seguranca.md)
