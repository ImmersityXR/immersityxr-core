FROM node:latest
COPY . /immersity
WORKDIR /immersity
RUN npm install

# Start and enable SSH
RUN apt-get update \
    && apt-get install -y --no-install-recommends dialog \
    && apt-get install -y --no-install-recommends openssh-server \
    && echo "root:Docker!" | chpasswd \
    && chmod u+x ./entrypoint.sh
COPY sshd_config /etc/ssh/

EXPOSE 80 2222

ENTRYPOINT ["./entrypoint.sh"]