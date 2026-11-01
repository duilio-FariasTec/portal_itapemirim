# CI/CD

Diretório reservado; não adicionar workflows até confirmar repositório/provedor Git, políticas de branch/ambiente, SDKs suportados, comandos reais da solução, testes e scanners, conta/região AWS e role de implantação.

Fluxo pretendido para avaliação: revisão de PR, build e testes, análise de dependências/imagem, artefato imutável, ambiente não produtivo e promoção protegida com health checks e rollback. Usar federação OIDC para assumir role AWS de menor privilégio; não usar chaves estáticas. Separar permissões por ambiente e proteger produção.

Ferramenta de IaC, estratégia de migração de banco, proveniência/assinatura de artefatos e modo de implantação permanecem pendentes. Não publicar nem fazer deploy com base nesta documentação.
