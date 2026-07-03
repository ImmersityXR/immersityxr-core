# serve with nginx
FROM nginx:stable-alpine
USER root

COPY ./default.conf /etc/nginx/conf.d/default.conf
COPY ./nginx.conf /etc/nginx/nginx.conf
COPY ./entrypoint.sh ./buildserver-entrypoint.sh

RUN apk update \
    && apk upgrade \
    && apk add bash

RUN chmod u+x ./buildserver-entrypoint.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
ENTRYPOINT ["./buildserver-entrypoint.sh"]