# Deploy e infraestrutura

Direção pretendida, ainda sujeita a decisão: ECS Fargate em sub-redes privadas, ECR, ALB HTTPS, RDS SQL Server privado, Secrets Manager e CloudWatch. Nenhuma configuração de implantação está aprovada por esta nota.

Antes de criar artefatos, confirmar ambientes/região/custo, provedor Git, IaC, rede e saída, Security Groups, IAM, política de segredos/criptografia, observabilidade, backups, HA/RPO/RTO, migrations e estratégia de rollout/rollback. Serviços como WAF, KMS, CloudTrail, ACM, S3, CloudFront, NAT e VPC endpoints são complementares a avaliar.

Não armazenar credenciais, estado de Terraform ou segredos neste diretório. Não executar deploy ou migração compartilhada sem pedido explícito e contexto de ambiente autorizado. CI/CD deve usar federação OIDC e privilégio mínimo, sem chaves AWS estáticas.
