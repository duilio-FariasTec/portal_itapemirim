# Back-end ANI

ANI Core: API REST proposta em C# / ASP.NET Core, com Microsoft SQL Server, atrás de um BFF Node.js no fluxo desejado Angular → BFF → Core. Este espaço contém documentação e arquivos de exemplo; confirme a árvore antes de assumir o estado da implementação. Não invente regras de negócio.

## Estrutura prevista

- `src/`: estrutura sugerida com `ANI.Api`, `ANI.Application`, `ANI.Domain`, `ANI.Infrastructure`, a validar contra o repositório e os padrões oficiais.
- `tests/`: testes unitários e de integração; usar banco descartável ou dependência controlada e dados sintéticos.
- `docs/`: contrato inicial ilustrativo e decisões de integração.
- `config/`: exemplos não secretos.
- `deploy/`: artefatos IaC/deploy somente após definição da ferramenta.

## Desenvolvimento local

1. Confirme repositório oficial, SDK .NET, EF Core, provider SQL Server e padrões da organização.
2. Crie/ajuste solução e projetos sem substituir arquivos existentes, após aprovação do escopo.
3. Configure desenvolvimento por User Secrets ou variável de ambiente; nunca comite credenciais. `config/appsettings.Development.example.json` é exemplo não secreto.
4. Aplique migrations somente em banco local descartável até existir processo revisado e autorizado.
5. Use scripts/comandos presentes na solução; esta documentação não inventa comandos executáveis.

## Convenções

- Endpoints versionados sob `/api/v1`; publicar OpenAPI e manter contrato revisado.
- Separar transporte HTTP, aplicação/regras, domínio e persistência conforme a complexidade justificar; evitar camadas vazias por cerimônia.
- Validar entrada, aplicar autorização em cada operação e usar consultas parametrizadas.
- Paginação, filtros, exclusão, idempotência e formato de erro serão definidos no contrato aprovado.
- Auditar ações relevantes sem registrar tokens, segredos ou dados sensíveis desnecessários.
- Testar regras quando forem especificadas, inclusive negação de acesso; nunca usar dados reais.
- EF Core e provider Microsoft SQL Server são escolhas sugeridas; confirmar versões suportadas e compatibilidade do SQL Server/RDS.
- Tratar `/api/v1` como prefixo candidato. Autenticação e autorização precisam cobrir leituras e escritas; validar emissor, audiência, assinatura, expiração e claims conforme IdP aprovado.
- O BFF faz parte do fluxo desejado e não substitui o Core como autoridade de autorização. Definir a autenticação da comunicação BFF-Core.
- Login e senha foram indicados sem IdP nesta etapa; especificar fluxo seguro antes de implementar, sem armazenar senha em texto puro.

Consulte [contrato API inicial](docs/contrato-api-inicial.md), [deploy](deploy/README.md) e [pendências](../docs/decisoes-e-pendencias.md).
