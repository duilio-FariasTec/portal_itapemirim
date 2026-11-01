# Contexto do ANI

## Objetivo conhecido

O ANI (Autorizador Nova Itapemirim) está sendo organizado como uma plataforma central para autenticação, gestão de acessos e autorização dos portais existentes, com portal administrativo e API central. A intenção é integrar os portais gradualmente, sem exigir sua reescrita. Este registro resume o objetivo descrito pelo usuário; não substitui descoberta nem aprovação das regras.

## Diretrizes recebidas

Angular para o portal administrativo, C# / ASP.NET Core para a API, Microsoft SQL Server para persistência e AWS como ambiente previsto. O documento mestre propõe ECS Fargate, ECR, ALB HTTPS, RDS privado, Secrets Manager e CloudWatch. Consulte [arquitetura e status](../docs/arquitetura-ani.md).

## Informações recebidas do cliente — 2026-10-31

- Repositório oficial informado: `fariasTEc` no GitHub. URL e repositório exato ainda precisam ser associados a este workspace.
- O próprio time responderá por negócio, segurança, plataforma e operação; nenhum padrão preexistente foi identificado.
- Fluxo desejado: Front-end Angular → BFF em Node.js → ANI Core em C# com SQL Server.
- Não haverá IdP corporativo nesta etapa. A direção atual é login e senha, com perfil por pessoa e permissões associadas ao perfil.
- Esta direção ainda não define um mecanismo de autenticação de produção. No protótipo local, os campos de login e senha são somente visuais: não validam nem enviam credenciais; a caixa antirobô também é demonstrativa.
- Um consumidor inicial: a intranet, sem back-end próprio. Integrações futuras serão avaliadas conforme a demanda.
- Esclarecimento posterior: haverá duas experiências de front-end: (1) uma tela/componente de login do ANI incorporada aos sistemas consumidores, que autentica e retorna os acessos do usuário para aquele sistema; (2) um portal administrativo separado para solicitações/aprovações, manutenção de usuários, perfis, permissões e auditoria. O ANI centraliza a decisão de autorização. A intranet é o primeiro consumidor conhecido.
- Os usuários são cadastrados pela intranet. Foram citados os perfis/funções Admin, Consulta e Manutenção (TI); permissões e responsabilidades detalhadas serão definidas pelas áreas.
- A intenção é permitir todas as operações CRUD/GET; autorização por função, invariantes, filtros, ordenação, paginação e limites ainda precisam ser especificados.
- Não há regras de alçada conhecidas ou previstas neste momento.
- Modelo de dados e classificação/retenção dos dados serão levantados pelo time.
- Auditoria solicitada para inclusão, alteração e remoção.
- Ambiente de desenvolvimento é a prioridade atual; produção (PRD) também está no horizonte. Região, contas, desenho de ambientes e operação ainda não foram definidos.
- CI/CD e IaC precisarão ser estabelecidos. WAF, ACM, CloudFront/S3, KMS, CloudTrail, endpoints privados, NAT e controles de borda ficam para avaliação posterior.
- Edição/licença/versão SQL Server, migrations, backup/restauração e acesso operacional seguem sem definição.

Esses pontos são registro do entendimento recebido e não substituem contratos, regras de acesso ou decisões formais. A lista de lacunas está em [decisões e pendências](../docs/decisoes-e-pendencias.md).

## Ainda desconhecido ou não aprovado

- Usuários, portais consumidores, responsáveis e fluxos atuais de cadastro.
- IdP/SSO, provisionamento, autenticação de pessoas e integração máquina a máquina.
- Regras CRUD/GET, permissões efetivas, alçadas, estados, hierarquia e segregação de funções.
- Modelo de dados, classificação, retenção e requisitos legais de auditoria.
- Contrato e compatibilidade dos portais e protocolos efetivamente suportados.
- Repositório oficial de implementação, ambientes, região/custo AWS e operação.
- Protocolo e fluxo de integração para as aplicações consumidoras, cadastro de clientes/aplicações, sessões/SSO, emissão/validação de tokens e autorização por aplicação.
- Forma de incorporar tecnicamente o componente de login (por exemplo, componente web, bundle ou outra integração) e canal seguro de retorno dos acessos ao backend de cada sistema.

Não preencher lacunas por inferência. Registrar fatos novos apenas quando confirmados, sem dados pessoais ou segredos.
