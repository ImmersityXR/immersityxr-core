FROM node:lts-alpine

# === install node back end ===

RUN mkdir -p /komodo/portal/backend/node_modules \
    && chown -R node:node /komodo/portal/backend
WORKDIR /komodo/portal/backend
COPY --chown=node:node server/package*.json ./
USER node
RUN npm install
COPY --chown=node:node server/ .
EXPOSE 4040

# === install and run ssh ===

USER root
RUN apk add openrc \
    && apk add bash \
    && apk add openssh

RUN echo "root:Docker!" | chpasswd

COPY sshd_config /etc/ssh/

# === install and run mysql === 

COPY ./db/scripts /komodo/portal/backend/db/scripts

RUN apk add mariadb mariadb-client mariadb-dev \
    && mkdir /home/mysql \
    && chown mysql /home/mysql \
    && chown mysql /komodo/portal/backend/db/scripts

COPY --chmod=644 ./db/my.cnf /etc/mysql/my.cnf
COPY --chmod=644 ./db/mariadb-server.cnf /etc/my.cnf.d/mariadb-server.cnf
COPY --chmod=744 ./db/mariadb /etc/init.d/mariadb

# COPY ./db/scripts /docker-entrypoint-initdb.d
VOLUME /sys/fs/cgroup

# === copy env file and entrypoint ===

COPY --chmod=744 ./entrypoint.sh entrypoint.sh
COPY --chmod=744 ./seten[v].sh setenv.sh

# === run node back end ===

CMD [ "node", "index.js"]
ENTRYPOINT ["./entrypoint.sh"]
