# Banco de dados ANI

O arquivo [`ani-schema-draft.sql`](ani-schema-draft.sql) contém um DDL inicial para revisão e envio ao desenvolvedor. É um rascunho não aprovado e não foi executado em banco algum.

O documento mestre indica Microsoft SQL Server e propõe RDS for SQL Server privado na AWS. EF Core e provider SQL Server são sugestões para a persistência do back-end, sujeitas às versões aprovadas.

Entidades mencionadas (usuário, aplicação consumidora/cliente, perfil, permissão, associações e auditoria) são candidatas de modelagem, não esquema aprovado. Como o ANI autorizará acesso em vários sistemas, o modelo precisa identificar a aplicação e escopar as permissões por sistema. Confirmar campos, identificadores, relacionamentos, unicidade, estados, escopo, vigência, concorrência, histórico, exclusão, classificação e retenção antes de criar schema, migrations ou seeds.

O `ani-schema-draft.sql` antecede esse esclarecimento multiaplicação e ainda não modela cadastro de aplicações nem o vínculo explícito de permissões ao sistema. Não o tratar como modelo completo para autorização de vários sistemas; revisar essa parte com o desenvolvedor e as áreas.

Definir edição/licença e versão SQL Server/RDS, ambientes, processo de revisão e execução de migrations, backups, restauração e acesso operacional. Banco de produção deve permanecer privado, sem acesso público e acessível apenas por serviços autorizados. Use somente dados sintéticos; não comite credenciais, dados reais, dumps ou estado operacional.

Não há scripts de banco documentados aqui. Nenhuma migração em ambiente compartilhado está autorizada por esta nota.
