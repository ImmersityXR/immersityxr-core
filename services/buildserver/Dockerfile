# serve with nginx
FROM nginx:stable-alpine
USER root

COPY ./nginx.conf /etc/nginx/nginx.conf
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

RUN openrc default \
    && rc-update add sshd

EXPOSE 80 2222
CMD ["nginx", "-g", "daemon off;"]
ENTRYPOINT ["./buildserver-entrypoint.sh"]