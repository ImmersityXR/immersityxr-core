FROM node:lts-alpine
COPY ./ /app
WORKDIR /app
RUN npm install

FROM nginx
RUN mkdir /app
COPY --from=0 /app/dist /app
COPY nginx.conf /etc/nginx/nginx.conf
