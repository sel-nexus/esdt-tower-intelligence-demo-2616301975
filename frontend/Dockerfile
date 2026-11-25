FROM node:24.16.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-bin-links --no-fund --no-audit
COPY . .
RUN npm run build

FROM nginx:1.28.2-alpine
COPY nginx-runtime.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
