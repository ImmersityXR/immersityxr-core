# serve with nginx
FROM nginx:stable-alpine
COPY ./default.conf /etc/nginx/conf.d/
COPY ./builds /usr/share/nginx/html/builds
COPY ./entrypoint.sh ./buildserver-entrypoint.sh

# Start and enable SSH
RUN apt-get update \
    && apt-get install -y --no-install-recommends dialog \
    && apt-get install -y --no-install-recommends openssh-server \
    && echo "root:Docker!" | chpasswd \
    && chmod u+x ./buildserver-entrypoint.sh
COPY sshd_config /etc/ssh/

EXPOSE 80 2222
ENTRYPOINT ["./buildserver-entrypoint.sh"]