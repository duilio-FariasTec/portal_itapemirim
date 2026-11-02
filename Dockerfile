# ==============================================================================
# Stage 1: Build das aplicações Angular (ani-admin e ani-login)
# ==============================================================================
FROM node:24-alpine AS builder
WORKDIR /build

COPY front-end/package.json front-end/package-lock.json ./
RUN npm ci

COPY front-end/ ./
RUN npx ng build ani-admin --base-href /admin/ && \
    npx ng build ani-login --base-href /login/

# ==============================================================================
# Stage 2: Runtime leve Node.js 24 (BFF + Arquivos Estáticos de Homologação)
# ==============================================================================
FROM node:24-alpine AS runtime
WORKDIR /app

# Copiar código do BFF (TypeScript nativo suportado pelo Node 24)
COPY front-end/bff/ani-admin/package.json ./bff/ani-admin/package.json
COPY front-end/bff/ani-admin/src/ ./bff/ani-admin/src/

# Copiar bundles compilados do Angular para o diretório estático do BFF
COPY --from=builder /build/dist/ani-admin/browser ./static/admin
COPY --from=builder /build/dist/ani-login/browser ./static/login

# Variáveis de ambiente padrão para Homologação na AWS ECS Express Mode
ENV NODE_ENV=homologation
ENV ANI_BFF_HOMOLOGATION=true
ENV ANI_BFF_HOST=0.0.0.0
ENV ANI_BFF_PORT=8080
ENV ANI_STATIC_DIR=/app/static
ENV ANI_LOGIN_FRONTEND_URL=/login/
ENV ANI_ADMIN_FRONTEND_URL=/admin/
ENV ANI_BFF_ENABLE_WRITES=true
ENV ANI_BFF_ENABLE_PUBLIC_REGISTRATION=false
ENV ANI_LOGIN_CONTRACT=core-bearer-v1
ENV ANI_CORE_BASE_URL=https://po-25bbb3c112ec4ce7ba42aae7c30034a5.ecs.us-east-1.on.aws

# Executar como usuário não-root (node) por segurança corporativa
USER node

EXPOSE 8080

CMD ["node", "--experimental-strip-types", "/app/bff/ani-admin/src/api-server.ts"]

