# Arquitetura de UI e Sistema de Design do Front-end ANI

**Nome profissional:** Arquitetura de UI e Sistema de Design (Design System) Angular ANI.

**Status:** diretriz visual e de arquitetura do workspace Angular local já implementado. `ani-login` e `ani-admin` têm folhas de estilo próprias e compartilham tokens em `libs/design-tokens/`; a marca oficial completa, versões suportadas, biblioteca de componentes aprovada e design system corporativo ainda não foram confirmados. As regras abaixo orientam a evolução e não declaram aprovação final de acessibilidade ou marca.

**Implementação de Meu Perfil (2026-11-01):** `apps/ani-admin/src/app/features/meu-perfil/` contém componente standalone com abas Meus dados, Acessos e Trocar senha, porta injetável `MY_ACCOUNT_API`, tokens com fallback e container queries para adaptação à largura do host. Abas têm navegação por teclado; o avatar abre a página no desktop e celular. A revisão visual não é certificação WCAG. Reutilização externa exige adaptador e autorização/sessão do consumidor; o componente não substitui controles do servidor. Demais extrações descritas abaixo continuam propostas.

## Objetivo

Manter as experiências Angular ANI visualmente coerentes e fáceis de alterar sem acoplar layouts, autenticação ou regras de negócio. A identidade deve lembrar a Nova Itapemirim de forma contemporânea e limpa: superfícies claras, tipografia legível, grafite para ações principais e amarelo institucional como destaque controlado. Se Amazon Cognito for aprovado, a tela que coleta credenciais será Managed Login; Angular pode hospedar o ponto de entrada/contexto e solicitação de acesso, mas não duplicar a autenticação.

Uma alteração de cor institucional, tipografia, foco, espaçamento ou componente comum deve poder ser feita em um único lugar e aplicada nos dois apps. Login e administração podem ter layouts próprios e manter builds/releases independentes.

## Decisão arquitetural recomendada

Se as duas aplicações forem mantidas pelo mesmo time/repositório, usar um **workspace Angular CLI com dois projetos de aplicação e bibliotecas internas compartilhadas**. Workspace é organização de código; não obriga que os apps sejam publicados juntos. Cada app gera seu próprio build e possui configuração, deploy, rotas, estado e sessão independentes.

```text
front-end/
├── angular.json                       # configura os dois builds Angular
├── apps/
│   ├── ani-login/                    # opcional; contexto/solicitação e link para OIDC
│   │   └── src/app/
│   │       ├── core/                   # clientes de API de identidade; sem UI compartilhada aqui
│   │       ├── layout/access-shell/    # cabeçalho ANI, contexto do cliente, ações de acesso
│   │       └── features/
│   │           └── solicitacao-acesso/
│   └── ani-admin/
│       └── src/app/
│           ├── core/                   # sessão/BFF e capacidades de UI
│           ├── layout/admin-shell/     # navegação, cabeçalho e área de trabalho
│           └── features/
│               ├── solicitacoes/
│               ├── usuarios/
│               ├── sistemas/
│               ├── perfis/
│               ├── permissoes/
│               ├── auditoria/
│               └── relatorios/
├── libs/
│   ├── design-tokens/                  # marca, tokens semânticos e temas
│   ├── ui/                             # componentes de apresentação acessíveis
│   └── brand-assets/                   # logos/fontes aprovados e ícones de marca
└── docs/
    ├── arquitetura-ui-design-system.md
    └── design-system/                  # catálogo, decisões e exemplos visuais

bff/ani-admin/                          # Node.js/TypeScript, serviço separado do Angular
```

Organizar telas e código de negócio por domínio/feature, não por grandes pastas genéricas de `components`, `services` ou `directives`. Separar um novo pacote `ui-patterns` somente quando houver padrões de interação reutilizados e estáveis; não antecipar uma biblioteca extensa.

Se o repositório oficial não for um monorepo/workspace, manter os mesmos limites e distribuir `design-tokens`/`ui` como pacotes internos versionados. Não copiar folhas de estilo manualmente entre repositórios.

## Camadas visuais

| Camada | Responsabilidade | Exemplos ANI |
|---|---|---|
| **Fundamentos e tokens** | Valores e decisões visuais centralizados, sem regra de negócio | Paleta institucional, cores semânticas, fontes, escala de espaçamento, raios, sombras, foco e breakpoints |
| **Componentes UI** | Controles reutilizáveis, acessíveis e sem estado de domínio | Botão, campo, seletor, alerta, badge de status, diálogo, paginação |
| **Padrões de interação** | Combinações comuns de componentes e comportamento | Busca/filtros, confirmação de revogação, formulário com erros, tabela com paginação |
| **Layouts de aplicação** | Estrutura visual própria de cada experiência | `LoginShell` e `AdminShell` |
| **Páginas/features** | Conteúdo e composição das funcionalidades ANI | Solicitação de acesso, fila de aprovação, usuários, auditoria |

O fluxo de dependência deve ser de cima para baixo: página → padrão → componente → tokens. `design-tokens` e `ui` não importam APIs, sessão, perfis, regras de autorização ou modelos de usuário. Layouts não decidem acesso; recebem apenas estado visual já calculado pelas camadas próprias do app.

## Organização de CSS e temas

### Fonte única de estilos

Manter uma entrada global por aplicação e escopar CSS de página/componente no próprio Angular. Usar CSS Custom Properties para tokens semânticos em runtime e SCSS apenas para mixins, mapas e breakpoints de compilação. Não criar duas fontes concorrentes de cores em Sass e CSS.

```text
libs/design-tokens/src/
├── tokens.css                 # custom properties semânticas compartilhadas
├── _breakpoints.scss          # breakpoints de layout para mixins/media queries
├── _mixins.scss               # mixins de foco, texto e layout somente se recorrentes
└── themes/
    ├── itapemirim-light.css   # tema claro inicial
    └── itapemirim-dark.css    # só incluir se modo escuro for aprovado

apps/ani-login/src/styles.scss # importa reset/base, tokens e tema do app
apps/ani-admin/src/styles.scss # importa reset/base, tokens e tema do app
```

As páginas e componentes devem consumir nomes semânticos como `--ani-color-surface`, `--ani-color-text`, `--ani-color-action-primary`, `--ani-color-focus` e `--ani-color-danger`, não valores hexadecimais da marca espalhados pelo CSS. Se a paleta oficial mudar, atualiza-se a implementação dos tokens sem reescrever telas.

### Tokens por função

1. **Marca:** cores/fonte/logos extraídos de assets e diretrizes oficiais aprovadas.
2. **Semânticos:** `surface`, `surface-muted`, `text-primary`, `text-secondary`, `border`, `action-primary`, `focus`, `success`, `warning`, `danger` e `info`.
3. **Estruturais:** spacing scale, largura de conteúdo, largura de formulário, raios, sombras, densidade, tipografia e breakpoints.
4. **Componente:** tokens específicos somente quando um componente tiver necessidade real; não proliferar variantes de cor por tela.

Amarelo da marca deve ser acento — marca, foco, indicador selecionado ou detalhe — e não fundo dominante de navegação, tabela ou formulário. A cor de estado (erro/sucesso/aviso) deve ser semântica e distinta da identidade amarela. Status nunca deve depender apenas da cor: incluir texto/ícone e estado acessível.

### Regras de CSS

- Usar o encapsulamento padrão de estilos Angular; estilos globais ficam limitados a reset, tokens, fonte, tema e elementos base aprovados.
- Não usar `ViewEncapsulation.None` como atalho para corrigir layout compartilhado; preferir componente/token público.
- Não usar seletores globais de alta abrangência (`button`, `.active`, `.card`) para estilos de tela. Nomes de classes devem ser locais ao componente ou pertencer explicitamente à biblioteca UI.
- Evitar `!important`, especificidade crescente e overrides de classes internas de biblioteca.
- Não duplicar paletas, valores de margem, breakpoints e estados de foco em cada feature.
- Não carregar CSS ou JavaScript do site institucional em runtime. Usar somente logos/fontes/ícones autorizados e mantidos como assets versionados.
- Se Angular Material for escolhido, usar sua API pública de theming para cores, tipografia e densidade; não depender de DOM/classes internas dos componentes. Não misturar Angular Material com outro framework visual sem decisão explícita.

## Direção visual ANI

### `ani-login` (se mantido como aplicação Angular)

- Página de contexto e solicitação de acesso; a ação **Entrar** inicia redirect OIDC para Managed Login, sem campo de senha Angular.
- Layout independente, simples e sem sidebar administrativa.
- Mostrar claramente o nome do sistema ao qual o usuário está entrando; o contexto vem do cliente ANI registrado, nunca de um rótulo arbitrário fornecido pela query string.
- O usuário digita senha/MFA na tela do provedor OIDC hospedado sob domínio ANI. O sistema consumidor não hospeda formulário de senha.
- A solicitação de acesso é uma rota própria; deixa claro que envio não concede acesso automaticamente. Não presumir que a página hospedada do provedor comporte CTA customizado.

### `ani-admin`

- Shell administrativo próprio: navegação lateral que colapsa em telas estreitas, cabeçalho com contexto e operador autenticado, área de conteúdo com largura controlada.
- Páginas organizadas por tarefa: título, descrição curta, ação principal, filtros próximos à listagem e tabela responsiva.
- Ações de risco (revogar acesso, mudar perfil, aprovar cadastro) usam confirmação clara e contexto do alvo; não usar cor ou posição como único sinal.
- Dados sensíveis devem ser minimizados/mascarados conforme permissões definidas no servidor; layout não deve induzir acesso amplo por simples conveniência.

## Biblioteca de componentes

Criar apenas componentes comuns, de apresentação e com propósito bem definido:

| Componente | API de UI prevista | Cuidados |
|---|---|---|
| `AniButton` ou wrapper de botão | `variant`, `size`, `loading`, `disabled` | Não fazer chamada HTTP; estado loading precisa comunicar-se a leitor de tela |
| `AniFormField` | label, hint, erro, required | Label ligado ao input, instrução e erro anunciados semanticamente |
| `AniAlert` | tipo semântico, título, mensagem, dismissible opcional | Erros não podem depender só de cor; mensagem sem detalhe sensível |
| `AniStatusBadge` | status semântico + texto | Nunca representar autorização somente por cor |
| `AniDialog` | título, descrição, ações | Foco inicial, retorno de foco, teclado e cancelamento previsíveis |
| `AniDataTable` | colunas, estado vazio/loading/erro, paginação | A UI não recebe mais campos/linhas que o contrato autoriza; acesso a linhas protegido no servidor |

Wrappers de Angular Material só devem existir quando acrescentarem tema, acessibilidade ou API estável útil. Não recriar todos os controles nativos nem esconder capacidades importantes da biblioteca numa abstração rígida.

## Acessibilidade e responsividade

Adotar WCAG 2.2 nível AA como meta proposta, sujeita à validação organizacional. Especificar contraste de texto e controles, foco visível, navegação por teclado, ordem de foco, zoom/reflow, alvos de interação, nomes acessíveis, mensagens de validação e suporte a leitor de tela. Usar texto/ícone junto a cor e respeitar `prefers-reduced-motion`. A conformidade precisa ser avaliada no fluxo completo e em diferentes larguras, não apenas no componente isolado.

Breakpoints devem responder ao conteúdo, não a modelos de aparelho. Em desktop, tabelas podem mostrar mais colunas; em telas estreitas, priorizar campos e ações essenciais, oferecer rolagem explícita ou apresentação alternativa acessível e preservar contexto. Não reduzir fonte ou esconder ações críticas para “caber”.

### Comportamento responsivo atualmente implementado

- `ani-admin`: até 1100 px, reduz a largura da sidebar e reorganiza os atalhos; até 850 px, empilha cabeçalhos e ações; até 760 px, a sidebar vira menu lateral com backdrop, as listagens passam de tabela para cartões e filtros/diálogos/paginação se adaptam a toque; até 380 px, reduz gutters e empilha ações.
- `ani-login`: até 900 px, reduz a coluna de contexto; até 760 px, usa uma coluna e ajusta o cabeçalho/rodapé; até 380 px, reduz espaçamentos sem reduzir o tamanho legível dos controles.
- A implementação foi conferida visualmente em navegador local em larguras de 390 px e 320 px. A meta WCAG 2.2 AA continua proposta e requer validação completa de teclado, zoom, contraste e tecnologias assistivas.

## Contrato de contribuição para o design system

1. Criar/alterar token quando a decisão for usada por múltiplas telas ou representar marca/semântica global.
2. Criar componente shared quando o comportamento/estilo for repetido e sua API de UI estiver clara; variações específicas ficam na feature.
3. Registrar estados: default, hover, focus-visible, active, disabled, loading, erro e responsivo conforme o tipo.
4. Incluir exemplo de uso e limites de acessibilidade na documentação do componente.
5. Rever dependências e screenshots/visuais em alterações de tema, sem acoplar stories ao Core real ou a dados pessoais.

Um catálogo visual (Storybook ou documentação Angular equivalente) é recomendável depois que o workspace real existir; ferramenta e versão não estão decididas. O catálogo deve usar dados sintéticos e demonstrar tokens, componentes, layouts e estados.

## Decisões pendentes antes de consolidar

1. Localizar o repositório Angular oficial e escolher workspace compartilhado ou pacotes versionados.
2. Confirmar assets de marca, fonte, proporções do logo e guia oficial com a Nova Itapemirim; o wireframe usa apenas uma aproximação visual.
3. Escolher biblioteca base (recomendação a avaliar: Angular Material tematizado; alternativa é UI própria enxuta com componentes nativos acessíveis).
4. Confirmar Angular/Node suportados, CSS/SCSS, regras de lint e ferramenta de catálogo visual.
5. Definir acessibilidade alvo formal e validar paleta/contrastes antes de aprovar tokens finais.
6. Confirmar se haverá tema escuro e validar formalmente breakpoints, conteúdo/campos exibidos em `ani-admin` e acessibilidade das telas implementadas.

## Referências

- [Angular Style Guide — organização por áreas de funcionalidade](https://angular.dev/style-guide)
- [Angular — estilos e encapsulamento](https://angular.dev/guide/components/styling)
- [Angular Material — theming e tokens](https://material.angular.dev/guide/theming)
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Wireframes administrativos](wireframes-administracao.html)
- [Wireframes de login e solicitação](wireframes-login.html)
- [Mapa de front-ends ANI](mapa-front-end.md)
