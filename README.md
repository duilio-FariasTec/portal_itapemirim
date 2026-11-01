# ANI — Autorizador Nova Itapemirim

Repositório de destino informado pelo usuário: [duilio-FariasTec/portal_itapemirim](https://github.com/duilio-FariasTec/portal_itapemirim). O versionamento inclui código, contratos, testes e documentação. Configurações locais, credenciais, dependências instaladas, builds e evidências em `outputs/` ficam fora do Git.

Este diretório reúne documentação e o workspace de front-end/BFF em `front-end/`. O ANI Acesso já realiza login/senha → BFF → Core no QA explicitamente autorizado pelo usuário, com conta sintética e token mantido no servidor. Login, refresh de sessão e logout foram verificados na tela. Os mocks permanecem isolados para demonstração. Contratos dos demais domínios, autorização de negócio, integração de consumidores externos e operação de produção continuam pendentes. Consulte o [levantamento V1 ponta a ponta](front-end/docs/v1-login-ponta-a-ponta.md) e a [conexão ao Core](front-end/docs/conexao-core.md).

## Mapa

- [Contexto](contexto/README.md): objetivo conhecido e lacunas de descoberta.
- [Arquitetura](docs/arquitetura-ani.md): proposta de software, aplicação e AWS.
- [Identidade e integração](docs/arquitetura-identidade-integracao.md): recomendação Cognito/OIDC, autorização, integração BFF-Core e desenvolvimento local.
- [Decisões e pendências](docs/decisoes-e-pendencias.md): estado de cada tema e validações necessárias.
- [Segurança](seguranca/README.md): controles e limites de trabalho.
- [Decisões aprovadas](decisoes/README.md): como registrar decisões formais.
- [Avaliação de prontidão para desenvolvimento](docs/avaliacao-prontidao-desenvolvimento.md): parecer documental, bloqueios e critérios para iniciar uma fatia integrada.
- [Plano de trabalho](planos/README.md): sequência sugerida e condições para implementação.
- [Front-end](front-end/README.md) e [integração API](front-end/docs/integracao-api.md).
- [Prontidão V1 do front-end](front-end/docs/prontidao-v1.md), [mapa de front-end](front-end/docs/mapa-front-end.md), [arquitetura UI/design system](front-end/docs/arquitetura-ui-design-system.md) e [continuidade 2026-11-01](front-end/docs/continuidade-2026-11-01.md).
- [Back-end](back-end/README.md), [contrato API candidato](back-end/docs/contrato-api-inicial.md) e [deploy](back-end/deploy/README.md).
- [Banco de dados](database/README.md), [infraestrutura](infrastructure/README.md), [testes](tests/README.md) e [CI/CD](.github/workflows/README.md).

## Como começar

Leia `AGENTS.md`, `contexto/README.md`, `docs/decisoes-e-pendencias.md` e `seguranca/README.md`. Para trabalhar no front-end local, leia também `front-end/README.md` e `front-end/docs/prontidao-v1.md`. O workspace executável está em `front-end/`; antes de associá-lo ao repositório Git oficial, confirme URL, instruções e controles existentes. Use apenas dados sintéticos; não comite segredos. Nenhuma integração real, migração compartilhada, publicação ou implantação está autorizada por estas notas.
