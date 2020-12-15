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

## Syncing builds

### Windows
#### Install `rclone`
* Download [rclone](https://rclone.org/downloads/)
* Unzip the directory (name it `rclone`)
* Move the extracted directory to `Program Files`
* Add the directory to your System PATH (eg. `C:\Program Files\rclone\`)
* Run `rclone --help` from the command line to confirm

#### Configure rclone remote filesystem
* Run the following
```
rclone config
```
* Follow the interactive setup, choosing `New remote` and the `SSH/SFTP` backend (option 29 or `sftp`). 
* Connect to the Komodo host machine (eg. `komodo-dev.library.illinois.edu`)
* After entering your host credentials, use all default parameters. 
* You are ready to use `rclone` to sync builds

#### Copy existing remote builds to a local directory (optional)
```
rclone copy komodo-dev:/home/komodo/komodo_buildserver/builds ./builds --progress
```
#### Sync local build to remote host
* Make a build
* Move the new build to the appropriate scope in your local `builds` directory
* Run `rclone copy`
```
rclone copy ./builds komodo-dev:/home/komodo/komodo_buildserver/builds --progress
```
*You can also use the included `sync.sh` script which simply executes the above command. 

Read more about [`rclone` commands](https://rclone.org/commands/)