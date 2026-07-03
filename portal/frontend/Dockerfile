FROM node:lts-alpine AS build-stage
COPY ./ /app
WORKDIR /app
RUN ./entrypoint.sh
RUN npm install
RUN npm run build-dev

FROM nginx AS production-stage
RUN mkdir /app
COPY --from=build-stage /app/dist /app
COPY nginx.conf /etc/nginx/nginx.conf
