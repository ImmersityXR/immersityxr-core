FROM node:lts-alpine

# === install and run ssh ===

RUN apk add openrc \
    && apk add bash \
    && apk add openssh

RUN echo "root:Docker!" | chpasswd

COPY sshd_config /etc/ssh/

# === install and run mysql === 

RUN apk add mariadb mariadb-client mariadb-dev

COPY --chmod=644 ./db/my.cnf /etc/mysql/my.cnf
COPY --chmod=644 ./db/mariadb-server.cnf /etc/my.cnf.d/mariadb-server.cnf
COPY --chmod=744 ./db/mariadb /etc/init.d/mariadb

COPY --chmod=550 ./entrypoint.sh /usr/bin/entrypoint.sh
# COPY ./db/scripts /docker-entrypoint-initdb.d
VOLUME /sys/fs/cgroup

# === install and run node back end ===

COPY ./ /komodo/portal/backend
WORKDIR /komodo/portal/backend
RUN npm install
EXPOSE 4040
CMD [ "node", "index.js"]
ENTRYPOINT ["/usr/bin/entrypoint.sh"]
