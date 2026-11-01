# Continuidade do desenvolvimento ANI — 2026-11-01

## Fechamento atualizado — 2026-11-01

Esta seção substitui o estado mock-only da passagem histórica abaixo. O workspace usa login/senha → BFF → Core com token no servidor e sessão opaca no navegador. O mock continua sendo demonstração separada. Não houve deploy ou migração nesta entrega.

### Alterações incluídas

- Meu Perfil acessível pelo menu e pelo avatar, com abas Meus dados, Acessos e Trocar senha. Dados somente leitura, perfis por sistema, permissões efetivas e formulário de senha com validação/visibilidade.
- Componente standalone `ani-meu-perfil`, porta `MY_ACCOUNT_API`, estados independentes de carregamento, teclado nas abas e layout por container queries.
- GET `/bff/api/v1/me`, GET `/bff/api/v1/me/acessos` e POST `/bff/api/v1/auth/trocar-senha`, sempre com identidade derivada da sessão. Fallback de acessos limitado a informações da sessão em 403/404.
- Cadastro público direto opt-in e recuperação via BFF. Cadastro administrativo gera senha inicial no BFF conforme regra já existente (primeiro nome em minúsculas + `1234`); não é uma política segura aprovada para produção.
- Adaptação de sistemas, perfis e permissões ao contrato disponível, testes de regressão e OpenAPI local.

### Pendências e limites

- **Administrador global:** acesso total foi solicitado, não implementado neste pacote. Confirmar escopo por sistema, perfil global e códigos com o Core. `catalog.write` e `users.write` continuam necessárias, além da habilitação de escrita. Reautenticar após alterar permissões.
- **Cadastro/login:** não inferir senha gravada ou login bem-sucedido pelo retorno do cadastro. Confirmar login, status, política de credenciais, duplicidade e confirmação de e-mail; uma recusa de autenticação não comprova falta de perfil.
- **Senha:** revisar geração previsível, convite/recuperação, troca obrigatória e semântica de `usuario` na API. Troca real e efeito na sessão ainda não homologados.
- **V1:** solicitações/aprovações e relatório real pendentes, inativação sem semântica aprovada, build Admin de produção bloqueado por orçamento CSS.
- **Operação:** `.env.local` permanece fora do Git. Escritas desligadas no exemplo; habilitar apenas no ambiente autorizado. Reiniciar BFF encerra sessões em memória. Não publicar este servidor local.

### Verificações

Verificações executadas neste fechamento:

| Comando (em `front-end/`) | Resultado |
|---|---|
| `npm --prefix bff/ani-admin test` | 20 testes passaram |
| `npx ng test ani-admin --watch=false` | 18 testes passaram |
| `npx ng test ani-login --watch=false` | 10 testes passaram |
| `npx ng build ani-admin --configuration development` | Passou |
| `npx ng build ani-login` | Produção passou |
| `npx ng build ani-admin` | Falhou: `app.scss` com 16,66 kB para limite de 12 kB |

Os testes BFF usam Core HTTP sintético em loopback e não chamam a API real. O orçamento CSS não foi alterado. Revisão local dos arquivos alterados/novos não encontrou chaves privadas, tokens dos formatos verificados ou e-mails não sintéticos; essa checagem limitada não constitui auditoria de segurança. `.env.local` continua ignorado pelo Git. Evidências históricas abaixo não representam a contagem atual.

## Passagem histórica preparada em 2026-10-31

**Preparado em:** 2026-10-31  
**Objetivo:** retomar o desenvolvimento do front-end e BFF mock do ponto atual, sem reabrir decisões já documentadas nem tratar mocks como integração real.

## Contexto de trabalho

- Workspace de código: `Autorizador/front-end/`.
- Direção de arquitetura: `ani-login` e `ani-admin` em Angular → BFF dedicado em Node.js/TypeScript → ANI Core em C# → SQL Server.
- O código local contém os dois apps Angular, BFF local, mock do Core, mock de identidade, contratos TypeScript candidatos e tokens visuais. Os mocks usam dados sintéticos voláteis e não chamam AWS nem a API C# real.
- A API Core está sendo construída por outro analista. O OpenAPI/contrato implementado ainda não foi entregue ou alinhado nesta etapa.
- O repositório `fariasTEc` foi informado como oficial, mas a associação do workspace e a URL exata continuam pendentes. Não iniciar/copiar histórico Git sem confirmar a árvore e os controles existentes.

## O que foi concluído

### Fluxos locais

- A solicitação de acesso carrega sistemas ativos do catálogo mock e segue Angular → BFF → Core mock. Há validação nos limites, estados de erro/carregamento, protocolo de acompanhamento e auditoria sintética.
- No ANI Admin, a fila permite consultar e decidir solicitações, com confirmação e motivo opcional para rejeição. O detalhe exibe a justificativa original e o motivo da decisão, se houver. No mock, aprovar/rejeitar só muda o status; não cria usuário ou perfil nem concede acesso.
- O BFF local mantém sessão mock, exige CSRF nas mutações autenticadas, usa allowlist e encaminha somente ao Core mock local.
- O formulário de login do ANI Acesso segue visual: não autentica nem envia a senha. A caixa “Não sou um robô” é demonstrativa, não é CAPTCHA. O mock de identidade é um fluxo separado de demonstração do Admin.

### Layout desktop e mobile

- ANI Admin: sidebar permanente em telas maiores; menu lateral móvel com backdrop, Escape, foco inicial/retorno e contenção de tabulação. As listas viram cartões rotulados em telas estreitas; filtros, cabeçalho, ações, paginação e diálogos refluem.
- ANI Acesso: login e solicitação passam a uma coluna em telas menores; formulário usa campos de toque adequados e evita zoom automático no iOS.
- Verificação manual no navegador local: ANI Admin em 390 px; ANI Acesso em 390 px e 320 px. Não foi observado overflow horizontal. O layout desktop também foi revisado visualmente. Isso não constitui QA formal nem certificação WCAG.

## Verificações e limitações conhecidas

- Os servidores Angular de desenvolvimento recompilaram após as alterações recentes.
- Uma execução anterior de `npm run build` terminou com `Abort trap: 6` durante o `ng build`; a causa não foi identificada e a compilação de produção não está confirmada.
- Nenhum teste automatizado foi executado nesta última revisão visual/documental.
- O mock não implementa autenticação real, verificação de posse do e-mail, deduplicação definitiva, provisionamento após aprovação, matriz de permissões ou persistência compartilhada.

## Ordem sugerida para retomar

1. Ler `AGENTS.md`, o [README do workspace](../README.md), [prontidão da V1](prontidao-v1.md), [integração API](integracao-api.md) e [mapa front-end](mapa-front-end.md).
2. Confirmar que o workspace continua em `front-end/`, revisar instruções e estado Git antes de alterar código. Preservar o mock e usar apenas dados sintéticos.
3. Revisar as telas administrativas em desktop e mobile, não apenas a visão geral/fila: usuários, sistemas, perfis, permissões, auditoria, relatórios, detalhes e diálogos. Corrigir defeitos visuais observáveis sem inventar regras de negócio.
4. Verificar o menu móvel com teclado e foco, reflow/zoom, contraste e conteúdo dos cartões. WCAG 2.2 AA é meta proposta, ainda não certificada.
5. Investigar separadamente o `Abort trap: 6` da build de produção. Não declarar release pronta até obter evidência de build e definir a verificação de QA apropriada.
6. Quando o analista entregar OpenAPI/URL de ambiente local, alinhar rotas, DTOs, status, paginação, erros e autenticação; atualizar o cliente BFF e o mock a partir do contrato aprovado.
7. Manter como pendências de negócio: o que a aprovação provisiona, verificação de identidade/e-mail, duplicidade, matriz de autorização e perfil/escopo por sistema.

## Serviços locais

Os processos podem ter parado entre sessões; verificar antes de abrir novos. Se necessário, executar a partir de `front-end/`:

| Serviço | Comando | Endereço local |
|---|---|---|
| Mock ANI Core | `npm run local:core` | `127.0.0.1:3334` |
| Mock de identidade | `npm run local:idp` | `127.0.0.1:3335` |
| BFF local | `npm run local:bff` | `127.0.0.1:3333` |
| ANI Acesso | `npm run start:login` | `http://127.0.0.1:4201` |
| ANI Admin | `npm run start:admin` | `http://127.0.0.1:4200` |

Para o passo a passo completo, veja [README do front-end](../README.md). Não usar credenciais reais, não apontar mocks para serviços remotos e não fazer deploy. O usuário deverá fornecer/confirmar qualquer decisão de identidade, regra de negócio ou contrato que não esteja resolvida nos documentos.

## Documentos atualizados nesta passagem

- Raiz: `README.md`, `docs/arquitetura-ani.md`, `docs/decisoes-e-pendencias.md` e `docs/avaliacao-prontidao-desenvolvimento.md`.
- Front-end: `README.md`, `docs/prontidao-v1.md`, `docs/mapa-front-end.md`, `docs/arquitetura-ui-design-system.md`, `docs/fluxos-administracao.md` e `docs/integracao-api.md`.
