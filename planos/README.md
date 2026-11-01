# Planos de trabalho

Manter planos curtos ligados a tarefas autorizadas, com objetivo, escopo, áreas/arquivos, verificações e riscos. Não usar este diretório como cópia do código-fonte.

## Estado atual e sequência recomendada

Já existe um protótipo local de Angular e BFF com mocks em `front-end/`. Ele usa dados sintéticos e não representa integração com o Core C# ou autenticação de produção. Antes de continuar a implementação, revisar o workspace e os controles do repositório oficial; não substituir nem copiar o histórico Git existente.

1. Confirmar URL, organização, nome exato e instruções do repositório GitHub `fariasTEc`; revisar estrutura/controles e definir como associar o workspace atual antes de alterar histórico ou enviar código.
2. Obter o OpenAPI/contrato implementado pelo analista do ANI Core e alinhar rotas, DTOs, erros, paginação e autenticação com o BFF e os mocks locais.
3. Obter das áreas a matriz de permissões para Admin, Consulta e Manutenção (TI), além do modelo de dados e requisitos de auditoria de inclusão/alteração/remoção.
4. Decidir e aprovar identidade/autenticação para produção (provedor, protocolo, sessão, MFA e recuperação). Os campos de login atuais são demonstrativos e não enviam credenciais.
5. Validar versões suportadas de Angular/Node/.NET/EF Core/SQL Server e concluir a fatia local com dados sintéticos; planejar verificação de contrato e autorização antes de integrar ambiente compartilhado.
6. Definir Dev/PRD, IaC, rede, IAM, segredos, observabilidade, backups/recuperação, CI/CD, migrations e estratégia de deploy/rollback.
7. Avaliar controles complementares de borda e nuvem antes de exposição pública ou uso de dados relevantes.

Esta ordem é orientação, não autorização para provisionar ou implantar. Não iniciar migrações compartilhadas nem publicar sem escopo, controles e ambiente autorizados.
