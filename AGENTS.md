# ANI — instruções do projeto

## Estado e limites

Este diretório organiza a documentação e o piloto do Autorizador Nova Itapemirim (ANI). Não presuma que exista aqui um repositório de implementação completo: inspecione a árvore e o Git antes de qualquer mudança de código. Preserve o histórico e os arquivos existentes; não copie código-fonte sem necessidade. `sources/`, quando presente, é somente leitura.

Trate o ANI como sistema sensível até que classificação de dados, ambientes e controles sejam confirmados. Separe fatos confirmados, diretrizes solicitadas, propostas técnicas e decisões formalmente aprovadas. Um texto de arquitetura ou passagem de bastão não aprova automaticamente escolhas que nele estejam marcadas como candidatas ou pendentes.

## Segurança e operação

- Use somente dados sintéticos e anonimizados em exemplos, prompts, fixtures e logs. Nunca registre credenciais, tokens, chaves ou dados pessoais reais.
- Não enfraqueça autenticação, autorização, validação, prevenção a fraude, auditoria, idempotência, limites, monitoramento ou tratamento de erros.
- A API é a autoridade de autorização; controles ou ocultação no Angular não substituem validação no servidor.
- Mantenha o banco privado, com menor privilégio e acesso de rede restrito. Não presuma IdP, regras, contratos, edição/licença ou configuração de nuvem sem confirmação.
- Não chame serviços reais, execute operações financeiras, migrações compartilhadas, deploy ou publicação sem pedido explícito e ambiente autorizado.
- Antes de mudanças que afetem autorização, transações, dados ou segurança, explique o impacto e mantenha a alteração pequena e revisável.

## Forma de trabalho

Leia documentação e controles relevantes antes de implementar. Reutilize padrões existentes e evite refatoração fora do escopo. Preserve testes e controles. Execute verificações apropriadas quando solicitadas ou necessárias ao trabalho autorizado e relate somente o que foi efetivamente verificado.

## Organização da documentação

- `contexto/`: fatos confirmados sobre objetivo, usuários e fluxos.
- `docs/`: arquitetura e decisões/pendências.
- `decisoes/`: decisões aprovadas, com data, contexto e consequências.
- `seguranca/`: controles confirmados e limites de ambiente.
- `planos/`: planos curtos e revisáveis.
- `front-end/`, `back-end/`: documentação dos componentes planejados e existentes.
- `database/`, `infrastructure/`, `tests/`: orientações por assunto, sem duplicar grandes trechos de código.

Registre apenas informação necessária, confirmada e não sensível.
