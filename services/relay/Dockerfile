FROM node:latest
COPY . /komodo
WORKDIR /komodo
RUN npm install
RUN apt-get update && apt-get install rsync -y
CMD [ "node", "serve.js"]
EXPOSE 3000