# ---------- dbmate stage ----------
FROM alpine:3.19 AS dbmate-downloader
RUN apk add --no-cache wget upx \
 && wget -O /dbmate https://github.com/amacneil/dbmate/releases/download/v2.15.0/dbmate-linux-amd64 \
 && chmod +x /dbmate \
 && upx --best --lzma /dbmate

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run docs
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copiar dbmate comprimido
COPY --from=dbmate-downloader /dbmate /usr/local/bin/dbmate

# Dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Build y migraciones
COPY --from=builder /app/dist ./dist
COPY db/migrations ./db/migrations

EXPOSE 3000
CMD ["sh", "-c", "dbmate up && node dist/index.js"]

