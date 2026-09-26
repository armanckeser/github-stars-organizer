FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Empty on purpose. src/lib/api.ts does `import.meta.env.VITE_API_URL ?? "http://localhost:4000"`,
# and `??` does not fall through on "" — so an empty value makes every call relative
# and nginx in this same image proxies /api/ to the API container. A baked-in
# absolute URL would hardcode the hostname the site is reached by.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
