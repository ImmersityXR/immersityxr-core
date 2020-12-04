# Komodo Buildserver

## What is it? 
The buildserver serves a `builds` directory with the different versioned and custom builds for Komodo VR clients. It runs in a docker container, so you will have to map the host directory containing builds to the container. 

## Configure the buildserver
You will need to set the correct URL for the traefik `host` parameter in `docker-compose.yml` (eg. 'vr.komodo.edu'). This is the same endpoint used in Komodo Portal for embedding the client on session pages. 
```
      - "traefik.frontend.rule=Host:< URL FOR VR CLIENT ENDPOINT >"
```
You will need to create a `builds` directory, which is mapped by default in `docker-compose.yml`.
```
    volumes: 
      - ./builds:/usr/share/nginx/html
```
