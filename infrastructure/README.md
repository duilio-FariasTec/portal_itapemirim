# Infraestrutura ANI

Arquitetura pretendida a validar: VPC segmentada, entrada HTTPS por ALB, BFF Node.js e ANI Core C# em ECS Fargate/ECR e RDS SQL Server em sub-redes privadas; Secrets Manager e CloudWatch são serviços principais propostos. Confirmar se BFF e Core terão serviços/tarefas separados e o fluxo de rede entre eles. As tarefas não devem ter IP público e o banco não deve ser publicamente acessível.

O fluxo de rede sugerido é ALB → ECS → RDS, com Security Groups restritos. IAM de menor privilégio deve separar execução, runtime e pipeline; CI/CD deve usar OIDC em vez de chaves estáticas. VPC, CIDRs, Availability Zones, rotas/saída, endpoints, portas, região, ambientes, HA, RPO/RTO e custo ainda precisam de decisão.

KMS, CloudTrail, WAF, ACM, S3, CloudFront e endpoints privados são complementos a avaliar. Definir IaC, gestão de estado, revisão, secrets, observabilidade, backup/restore e rollout antes de criar recursos. Não guardar segredos ou estado IaC aqui. Esta documentação não autoriza provisionamento, publicação ou deploy.
