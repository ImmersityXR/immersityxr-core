FROM node:lts-alpine

# === install node back end ===

RUN mkdir -p /komodo/portal/backend/node_modules \
    && chown -R node:node /komodo/portal/backend
WORKDIR /komodo/portal/backend
COPY --chown=node:node package*.json ./
USER node
RUN npm install
COPY --chown=node:node . .
EXPOSE 4040

# === install and run ssh ===

USER root
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

# === run node back end ===

CMD [ "node", "index.js"]
ENTRYPOINT ["/usr/bin/entrypoint.sh"]
