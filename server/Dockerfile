FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY index.ts health.ts ./
CMD ["npx", "tsx", "index.ts"]
