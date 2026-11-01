# Segurança e limites de ambiente

Esta página registra controles de trabalho e direções que precisam de validação. A classificação formal dos dados, políticas corporativas e configuração dos ambientes ainda não foram confirmadas. Consulte também [instruções do projeto](../AGENTS.md) e [pendências](../docs/decisoes-e-pendencias.md).

## Controles a preservar

- A API deve autenticar e autorizar cada operação, inclusive leituras; negar por padrão e não confiar na interface Angular como barreira de segurança.
- Validar entradas, limitar paginação/frequência/tamanho conforme política definida, parametrizar consultas e não expor detalhes internos em erros.
- O cliente indicou login e senha sem IdP corporativo nesta etapa. Isso não dispensa um provedor de identidade e protocolo padrão. Antes de implementar, definir/selecionar OIDC, armazenamento com hash apropriado, recuperação, MFA (recomendação desta revisão para admin antes de produção, sujeita à aprovação), bloqueio/rate limit, expiração, revogação e resposta a abuso. Nunca armazenar senhas em texto puro nem criar protocolo/tokens próprios sem revisão especializada.
- O `ani-login` deve ser hospedado na origem controlada pelo ANI e iniciado por redirect; não coletar credenciais em formulário executado no domínio do sistema chamador. Registrar callbacks exatos e vincular a transação com `state`, `nonce` e PKCE conforme o protocolo.
- O navegador do `ani-admin` chama somente o BFF Node.js/TypeScript. Usar sessão server-side revogável, cookie endurecido, CSRF token e validação de origem; `SameSite` não basta sozinho. A chamada BFF-Core deve preservar o sujeito humano por delegação autenticada e o Core deve reautorizar cada request. Nunca confiar em perfil/cabeçalhos enviados pelo browser.
- A UI Angular não é barreira de autorização. O Core deve negar por padrão e aplicar controles a cada operação, ID e escopo, inclusive leituras, evitando acesso cruzado entre sistemas/usuários. BFF com rotas explícitas e allowlisted; sem proxy curinga.
- Usar dados sintéticos em desenvolvimento e testes. Não registrar tokens, segredos, credenciais nem dados pessoais desnecessários.
- Registrar operações relevantes em trilha de auditoria protegida, com acesso, retenção, integridade e conteúdo a definir com negócio e segurança.
- Segredos fora do código e de imagens; IAM de menor privilégio. A arquitetura propõe CI/CD com federação OIDC, sem chaves AWS estáticas.

## Limites de infraestrutura propostos

O RDS SQL Server deve permanecer privado e sem acesso público. O desenho sugerido restringe Security Groups em cadeia: ALB → tarefas ECS → banco; tarefas em sub-redes privadas e sem IP público. IAM, portas, origens, saída, endpoints privados, criptografia, rotação e retenção devem ser confirmados no desenho aprovado.

AWS KMS, CloudTrail, WAF, ACM, S3, CloudFront, VPC endpoints e alta disponibilidade são complementos ou escolhas a validar conforme os requisitos. Nenhum deploy, chamada a serviço real, operação financeira ou migração em ambiente compartilhado está autorizado por esta documentação.

## A confirmar antes de implementação

Classificação de dados, detalhes de autenticação/sessão e matriz de autorização, requisitos legais, retenção e auditoria, ambientes, rede, IAM, chaves/criptografia, backup/restauração, disponibilidade e RPO/RTO, monitoramento e resposta a incidentes. Registrar somente controles confirmados; nunca incluir valores de segredos ou dados reais.
