# Pinned to the active LTS line; node:latest pulls unpredictable majors
FROM node:22

COPY --chown=node:node ./package*.json /immersity/
WORKDIR /immersity
USER node
RUN npm install

COPY --chown=node:node . /immersity

USER root
RUN chmod u+x ./entrypoint.sh

EXPOSE 80

ENTRYPOINT ["./entrypoint.sh"]
