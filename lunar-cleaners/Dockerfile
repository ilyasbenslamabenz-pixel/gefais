FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 DATA_DIR=/app/server/data
EXPOSE 3001
VOLUME ["/app/server/data"]
CMD ["npx", "tsx", "server/src/index.ts"]
