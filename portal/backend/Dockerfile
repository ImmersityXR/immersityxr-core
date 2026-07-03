FROM node:lts-alpine

# === install node back end ===

RUN mkdir -p /immersity/portal/backend/node_modules \
    && chown -R node:node /immersity/portal/backend
WORKDIR /immersity/portal/backend
COPY --chown=node:node server/package*.json ./
USER node
RUN npm install
COPY --chown=node:node server/ .
EXPOSE 4040

# === install openrc (needed to run mariadb as a service) ===

USER root
RUN apk add openrc \
    && apk add bash

# === install and run mysql ===

COPY ./db/scripts /immersity/portal/backend/db/scripts

RUN apk add mariadb mariadb-client mariadb-dev \
    && mkdir /home/mysql \
    && chown mysql /home/mysql \
    && chown mysql /immersity/portal/backend/db/scripts

# Plain COPY + chmod (not COPY --chmod) so the image also builds on
# docker installs without BuildKit/buildx
COPY ./db/my.cnf /etc/mysql/my.cnf
COPY ./db/mariadb-server.cnf /etc/my.cnf.d/mariadb-server.cnf
COPY ./db/mariadb /etc/init.d/mariadb
RUN chmod 644 /etc/mysql/my.cnf /etc/my.cnf.d/mariadb-server.cnf \
    && chmod 744 /etc/init.d/mariadb

# COPY ./db/scripts /docker-entrypoint-initdb.d
VOLUME /sys/fs/cgroup

# === copy env file and entrypoint ===

# setenv.sh is optional (gitignored); the glob copies it only if present
COPY ./entrypoint.sh ./seten[v].sh ./
RUN chmod 744 ./entrypoint.sh \
    && { [ ! -f ./setenv.sh ] || chmod 744 ./setenv.sh; }

# === run node back end ===

CMD [ "node", "index.js"]
ENTRYPOINT ["./entrypoint.sh"]
