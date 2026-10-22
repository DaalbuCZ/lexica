FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@12.14.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY vite.config.js ./
COPY dist/ ./dist/
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/build/ /usr/share/nginx/html/
EXPOSE 80
