FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY index.ts app.ts health.ts github.ts github-lists.ts ./
CMD ["npx", "tsx", "index.ts"]
