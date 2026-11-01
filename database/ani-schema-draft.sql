/*
  ANI — rascunho de esquema relacional para revisão pelo time e pelo desenvolvedor.
  Plataforma alvo: Microsoft SQL Server.

  STATUS: NÃO APROVADO. Não executar em Dev/PRD antes da revisão de negócio,
  segurança e dados.

  Premissas deste rascunho:
  - Um usuário pode ter mais de um perfil (N:N), com histórico de concessão/revogação.
  - Um perfil pode ter mais de uma permissão (N:N), com histórico equivalente.
  - Remoção lógica é representada por status/revogação; FKs não usam cascade delete.
  - Auditoria registra metadados da operação, sem snapshots genéricos de valores.
  - O ANI Core/Business aplica autorização e regras; este DDL não implementa regras.
  - Admin, Consulta e Manutenção (TI) não são inseridos como dados iniciais: nomes
    e permissões precisam de validação pelas áreas.

  Segurança: PasswordHash deve conter somente um hash de senha produzido por uma
  biblioteca de password hashing apropriada, com parâmetros/salt no formato
  suportado por essa biblioteca. Nunca armazenar senha em texto puro. Não gravar
  hash de senha, tokens ou segredos na tabela de auditoria.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF SCHEMA_ID(N'ani') IS NULL
    EXEC(N'CREATE SCHEMA [ani]');

CREATE TABLE [ani].[Usuario]
(
    [UsuarioId]          BIGINT IDENTITY(1,1) NOT NULL,
    [Nome]               NVARCHAR(150) NOT NULL,
    [Login]              NVARCHAR(100) NOT NULL,
    [Email]              NVARCHAR(254) NULL,
    [SenhaHash]          NVARCHAR(512) NOT NULL,
    [Status]             NVARCHAR(20) NOT NULL
        CONSTRAINT [DF_Usuario_Status] DEFAULT (N'Ativo'),
    [CriadoEmUtc]        DATETIME2(3) NOT NULL
        CONSTRAINT [DF_Usuario_CriadoEmUtc] DEFAULT (SYSUTCDATETIME()),
    [AtualizadoEmUtc]    DATETIME2(3) NULL,
    CONSTRAINT [PK_Usuario] PRIMARY KEY CLUSTERED ([UsuarioId]),
    CONSTRAINT [CK_Usuario_Status]
        CHECK ([Status] IN (N'Ativo', N'Inativo', N'Bloqueado'))
);

CREATE UNIQUE INDEX [UX_Usuario_Login]
    ON [ani].[Usuario] ([Login]);

CREATE UNIQUE INDEX [UX_Usuario_Email]
    ON [ani].[Usuario] ([Email])
    WHERE [Email] IS NOT NULL;

CREATE TABLE [ani].[Perfil]
(
    [PerfilId]           BIGINT IDENTITY(1,1) NOT NULL,
    [Nome]               NVARCHAR(100) NOT NULL,
    [Descricao]          NVARCHAR(500) NULL,
    [Ativo]              BIT NOT NULL
        CONSTRAINT [DF_Perfil_Ativo] DEFAULT (1),
    [CriadoEmUtc]        DATETIME2(3) NOT NULL
        CONSTRAINT [DF_Perfil_CriadoEmUtc] DEFAULT (SYSUTCDATETIME()),
    [AtualizadoEmUtc]    DATETIME2(3) NULL,
    CONSTRAINT [PK_Perfil] PRIMARY KEY CLUSTERED ([PerfilId])
);

CREATE UNIQUE INDEX [UX_Perfil_Nome]
    ON [ani].[Perfil] ([Nome]);

CREATE TABLE [ani].[Permissao]
(
    [PermissaoId]        BIGINT IDENTITY(1,1) NOT NULL,
    [Codigo]             NVARCHAR(150) NOT NULL,
    [Nome]               NVARCHAR(150) NOT NULL,
    [Descricao]          NVARCHAR(500) NULL,
    [Recurso]            NVARCHAR(100) NOT NULL,
    [Acao]               NVARCHAR(50) NOT NULL,
    [Ativo]              BIT NOT NULL
        CONSTRAINT [DF_Permissao_Ativo] DEFAULT (1),
    [CriadoEmUtc]        DATETIME2(3) NOT NULL
        CONSTRAINT [DF_Permissao_CriadoEmUtc] DEFAULT (SYSUTCDATETIME()),
    [AtualizadoEmUtc]    DATETIME2(3) NULL,
    CONSTRAINT [PK_Permissao] PRIMARY KEY CLUSTERED ([PermissaoId])
);

CREATE UNIQUE INDEX [UX_Permissao_Codigo]
    ON [ani].[Permissao] ([Codigo]);

CREATE TABLE [ani].[UsuarioPerfil]
(
    [UsuarioPerfilId]        BIGINT IDENTITY(1,1) NOT NULL,
    [UsuarioId]              BIGINT NOT NULL,
    [PerfilId]               BIGINT NOT NULL,
    [ConcedidoPorUsuarioId]  BIGINT NULL,
    [ConcedidoEmUtc]         DATETIME2(3) NOT NULL
        CONSTRAINT [DF_UsuarioPerfil_ConcedidoEmUtc] DEFAULT (SYSUTCDATETIME()),
    [RevogadoPorUsuarioId]   BIGINT NULL,
    [RevogadoEmUtc]          DATETIME2(3) NULL,
    CONSTRAINT [PK_UsuarioPerfil] PRIMARY KEY CLUSTERED ([UsuarioPerfilId]),
    CONSTRAINT [FK_UsuarioPerfil_Usuario]
        FOREIGN KEY ([UsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [FK_UsuarioPerfil_Perfil]
        FOREIGN KEY ([PerfilId]) REFERENCES [ani].[Perfil] ([PerfilId]),
    CONSTRAINT [FK_UsuarioPerfil_ConcedidoPor]
        FOREIGN KEY ([ConcedidoPorUsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [FK_UsuarioPerfil_RevogadoPor]
        FOREIGN KEY ([RevogadoPorUsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [CK_UsuarioPerfil_Revogacao]
        CHECK ([RevogadoEmUtc] IS NULL OR [RevogadoEmUtc] >= [ConcedidoEmUtc])
);

CREATE UNIQUE INDEX [UX_UsuarioPerfil_Ativo]
    ON [ani].[UsuarioPerfil] ([UsuarioId], [PerfilId])
    WHERE [RevogadoEmUtc] IS NULL;

CREATE INDEX [IX_UsuarioPerfil_PerfilId]
    ON [ani].[UsuarioPerfil] ([PerfilId], [UsuarioId]);

CREATE TABLE [ani].[PerfilPermissao]
(
    [PerfilPermissaoId]      BIGINT IDENTITY(1,1) NOT NULL,
    [PerfilId]               BIGINT NOT NULL,
    [PermissaoId]            BIGINT NOT NULL,
    [ConcedidoPorUsuarioId]  BIGINT NULL,
    [ConcedidoEmUtc]         DATETIME2(3) NOT NULL
        CONSTRAINT [DF_PerfilPermissao_ConcedidoEmUtc] DEFAULT (SYSUTCDATETIME()),
    [RevogadoPorUsuarioId]   BIGINT NULL,
    [RevogadoEmUtc]          DATETIME2(3) NULL,
    CONSTRAINT [PK_PerfilPermissao] PRIMARY KEY CLUSTERED ([PerfilPermissaoId]),
    CONSTRAINT [FK_PerfilPermissao_Perfil]
        FOREIGN KEY ([PerfilId]) REFERENCES [ani].[Perfil] ([PerfilId]),
    CONSTRAINT [FK_PerfilPermissao_Permissao]
        FOREIGN KEY ([PermissaoId]) REFERENCES [ani].[Permissao] ([PermissaoId]),
    CONSTRAINT [FK_PerfilPermissao_ConcedidoPor]
        FOREIGN KEY ([ConcedidoPorUsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [FK_PerfilPermissao_RevogadoPor]
        FOREIGN KEY ([RevogadoPorUsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [CK_PerfilPermissao_Revogacao]
        CHECK ([RevogadoEmUtc] IS NULL OR [RevogadoEmUtc] >= [ConcedidoEmUtc])
);

CREATE UNIQUE INDEX [UX_PerfilPermissao_Ativa]
    ON [ani].[PerfilPermissao] ([PerfilId], [PermissaoId])
    WHERE [RevogadoEmUtc] IS NULL;

CREATE INDEX [IX_PerfilPermissao_PermissaoId]
    ON [ani].[PerfilPermissao] ([PermissaoId], [PerfilId]);

CREATE TABLE [ani].[Auditoria]
(
    [AuditoriaId]        BIGINT IDENTITY(1,1) NOT NULL,
    [AtorUsuarioId]      BIGINT NULL,
    [Acao]               NVARCHAR(20) NOT NULL,
    [Entidade]           NVARCHAR(100) NOT NULL,
    [EntidadeId]         NVARCHAR(128) NOT NULL,
    [Resultado]          NVARCHAR(20) NOT NULL,
    [Origem]             NVARCHAR(100) NULL,
    [CorrelationId]      UNIQUEIDENTIFIER NULL,
    [OcorridoEmUtc]      DATETIME2(3) NOT NULL
        CONSTRAINT [DF_Auditoria_OcorridoEmUtc] DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT [PK_Auditoria] PRIMARY KEY CLUSTERED ([AuditoriaId]),
    CONSTRAINT [FK_Auditoria_Ator]
        FOREIGN KEY ([AtorUsuarioId]) REFERENCES [ani].[Usuario] ([UsuarioId]),
    CONSTRAINT [CK_Auditoria_Acao]
        CHECK ([Acao] IN (N'INCLUSAO', N'ALTERACAO', N'REMOCAO')),
    CONSTRAINT [CK_Auditoria_Resultado]
        CHECK ([Resultado] IN (N'SUCESSO', N'FALHA'))
);

CREATE INDEX [IX_Auditoria_OcorridoEmUtc]
    ON [ani].[Auditoria] ([OcorridoEmUtc] DESC);

CREATE INDEX [IX_Auditoria_Ator_OcorridoEmUtc]
    ON [ani].[Auditoria] ([AtorUsuarioId], [OcorridoEmUtc] DESC);

COMMIT TRANSACTION;

/*
  Revisões necessárias antes de transformar em migration:
  1. Confirmar se a pessoa pode ter múltiplos perfis; este rascunho permite.
  2. Definir normalização/collation e unicidade de Login/Email.
  3. Validar estados de Usuario, nomes e ciclo de vida de Perfil/Permissao.
  4. Definir campos obrigatórios de Usuario e política de hash/recuperação de senha.
  5. Definir dados, acesso e retenção da Auditoria; não incluir credenciais/segredos.
  6. Confirmar edição/versão do SQL Server e padrões de migration do repositório.
*/
