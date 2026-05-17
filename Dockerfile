FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install && npm install --prefix server && npm install --prefix client

COPY client ./client
COPY server ./server

RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package.json ./
COPY server/package.json ./server/

RUN npm install --omit=dev && npm install --prefix server --omit=dev

COPY server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1

CMD ["node", "server/index.js"]
