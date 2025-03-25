# serve with nginx
FROM nginx:stable-alpine
COPY ./default.conf /etc/nginx/conf.d/
COPY ./builds /usr/share/nginx/html/builds
COPY ./entrypoint.sh ./buildserver-entrypoint.sh

RUN apk update \
    && apk upgrade \
    && apk add openrc \
    && apk add bash \
    && apk add openssh

RUN echo "root:Docker!" | chpasswd \
    && chmod u+x ./buildserver-entrypoint.sh

COPY sshd_config /etc/ssh/

EXPOSE 80 2222
ENTRYPOINT ["./buildserver-entrypoint.sh"]