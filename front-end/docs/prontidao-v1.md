# Prontidão do front-end ANI para a V1

**Atualização de integração (2026-10-31):** há agora BFF de transporte real com acesso local por chave, sessão/CSRF, validação de DTOs, allowlist e adaptação de respostas. Consulte [conexão ao Core](conexao-core.md) para execução e limites. O modo mock descrito abaixo continua separado. O acesso remoto e os schemas reais não foram validados; autenticação/autorizações de produção continuam pendentes.

## O que está pronto para navegação local

- `ani-admin` tem navegação, filtros, paginação, detalhes, cadastro/edição, inativação lógica, associação e revogação de perfis e permissões, aprovação/rejeição de solicitações, auditoria e exportação CSV.
- `ani-admin` chama somente o caminho `/bff/api/v1` por um serviço Angular tipado. O browser não chama o ANI Core diretamente.
- O BFF local valida sessão mock, CSRF para mutações autenticadas e allowlist de rotas. O mock Core tem dados sintéticos em memória e registra eventos de auditoria das mutações.
- `ani-login` busca sistemas ativos no catálogo mock e envia a solicitação por `HttpClient`. A tela e o BFF validam formato e limites; o Core mock valida o sistema ativo, cria protocolo e registra um evento sintético de auditoria.
- O ANI Admin confirma aprovação/rejeição, aceita motivo de rejeição, evita envio repetido durante uma operação e mostra o motivo no detalhe. A aprovação está identificada como atualização de status mock; não provisiona usuário ou perfil.
- O detalhe da solicitação mostra os campos recebidos, incluindo justificativa original do solicitante e motivo da decisão quando preenchido. A justificativa é conteúdo livre e continua sujeita às regras de acesso e retenção que o Core definir.
- Modais administrativos têm tratamento de `Esc`, foco inicial, contenção de tabulação e tentativa de retorno do foco à ação que abriu o modal. A saída atualiza a sessão/CSRF antes de encerrar e limpa a interface se o BFF rejeitar sessão expirada.
- A responsividade do `ani-admin` foi ajustada: sidebar desktop; menu lateral móvel com backdrop, Escape e manejo de foco; listagens como cartões rotulados em telas estreitas; filtros, ações, paginação e modais adaptados ao toque.
- `ani-login` e a solicitação de acesso refluem para uma coluna em telas estreitas, com largura e campos adequados. Revisão visual manual no navegador local em 390 px para Admin e em 320/390 px para ANI Acesso, sem overflow horizontal observado.
- Os serviços locais são restritos a loopback/desenvolvimento. Eles não devem ser publicados nem apontados para uma API real.

## Rotas cobertas pelo mock

| Domínio | Rotas exercitadas pela UI |
|---|---|
| Usuários | `GET/POST /usuarios`, `GET/PUT/DELETE /usuarios/{id}`, `GET/POST /usuarios/{id}/perfis`, `DELETE /usuarios/{id}/perfis/{perfilId}`, `GET /usuarios/{id}/permissoes-efetivas` |
| Perfis | `GET/POST /perfis`, `GET/PUT/DELETE /perfis/{id}`, `GET/POST /perfis/{id}/permissoes`, `DELETE /perfis/{id}/permissoes/{permissaoId}` |
| Permissões | `GET/POST /permissoes`, `GET/PUT/DELETE /permissoes/{id}` |
| Auditoria | `GET /auditoria` e detalhe quando disponível |
| Complementares da UI | `GET /portais` (metadados do catálogo ativo do mock), solicitações de cadastro e `GET /relatorios/acessos` |

Estas rotas adicionais e seus payloads são **provisórios** quando não aparecem no contrato que o analista do Core implementar. O `GET /portais` público no BFF é limitado a metadados do catálogo ativo do mock. A aprovação mock muda somente o estado da solicitação; não cria usuário nem concede perfil. O mock valida navegação e formato da tela; não confirma que o Core real possui esses recursos ou essas regras.

## Pronto para QA exploratório do mock

- Jornada validada localmente: abrir solicitação → carregar catálogo → enviar ao BFF → registrar no mock Core → receber protocolo → analisar no ANI Admin → rejeitar com motivo → consultar detalhe atualizado.
- A compilação incremental dos dois aplicativos Angular concluiu após as mudanças de interface. A compilação de produção não está confirmada: uma execução anterior de `npm run build` terminou em `Abort trap: 6`; investigar antes de fechar uma entrega V1.
- A revisão de responsividade acima é manual e limitada às viewports indicadas; não é certificação WCAG nem aprovação formal de QA.
- Os dados da validação foram sintéticos e permaneceram somente em memória. Reiniciar o processo `local:core` restaura o conjunto inicial de solicitações, usuários, sistemas, perfis, permissões e auditoria. Reiniciar o BFF invalida sessões mock.
- Antes de encaminhar para QA, entregar este README, os cinco comandos locais e os cenários de demonstração. QA deve confirmar início limpo dos serviços em sua própria máquina e usar endereços `example.invalid` para cadastros sintéticos.

O formulário de login do ANI Acesso continua sem integração: os campos são apenas protótipo e não enviam credenciais; o checkbox antirobô é apenas visual. Há um provedor de identidade mock separado para exercitar redirect/sessão no ANI Admin, mas o formulário do ANI Acesso não está ligado a ele. O login real depende da decisão de identidade e contrato.

## O que falta para afirmar “pronto para conectar e fechar V1”

1. Receber o OpenAPI publicado/gerado pelo ANI Core e mapear rota, método, payload, paginação, filtros, códigos HTTP, erros e enums. Ajustar tipos, cliente, BFF e mock para refletirem esse contrato como fonte única.
2. Definir se aprovação de solicitação provisiona identidade, usuário e perfil ou só registra uma decisão, e alinhar a regra no Core. O mock deliberadamente só atualiza o status.
3. Definir prevenção de duplicidade e comprovação de identidade/e-mail para solicitação pública. O mock não deduplica nem verifica a posse do e-mail.
4. Definir com o responsável do Core o fluxo real de autenticação e a propagação confiável da identidade do operador. URL e token isolados não definem sessão, permissões, renovação, revogação, logout ou ator de auditoria.
5. Aprovar matriz de autorização e regras de negócio com as áreas. Guardas e capacidades no Angular são somente UX; autorização final deve ocorrer no servidor.
6. Definir AWS/ambientes, configuração externa, secrets, logs sem dados sensíveis, observabilidade, limites distribuídos, armazenamento compartilhado de sessão, pipeline e procedimento operacional antes de produção.

Não colocar token privilegiado em Angular, `environment.ts`, armazenamento do browser ou query string. A futura URL do Core e credenciais devem ser configuração server-side protegida. Não se deve assumir um token fixo compartilhado antes de avaliar sua expiração, audiência, rotação, escopo e vínculo com o usuário.

## Como trocar o mock pelo Core real

1. Importar o OpenAPI aprovado e confirmar a versão/ambiente da API.
2. Implementar o cliente HTTP do BFF para o Core, com allowlist explícita, timeout, limite de resposta, correlação e mapeamento de erros. Manter o browser falando com o BFF.
3. Implementar autenticação e autorização server-side conforme o contrato; não aceitar permissões vindas da UI como prova.
4. Alinhar os tipos TypeScript com o OpenAPI e remover divergências entre mock e Core.
5. Rodar testes de contrato e fluxos com ambiente não produtivo e identidades/dados sintéticos autorizados.

Até essas etapas estarem concluídas, o estado correto é **front-end e BFF mock navegáveis para desenvolvimento**, não V1 integrada ou pronta para produção.
