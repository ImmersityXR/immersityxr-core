FROM node:latest

COPY --chown=node:node ./package*.json /immersity/
WORKDIR /immersity
USER node
RUN npm install

COPY --chown=node:node . /immersity

# Start and enable SSH
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends dialog \
    && apt-get install -y --no-install-recommends openssh-server \
    && echo "root:Docker!" | chpasswd \
    && chmod u+x ./entrypoint.sh
COPY sshd_config /etc/ssh/

EXPOSE 80 2222

ENTRYPOINT ["./entrypoint.sh"]
