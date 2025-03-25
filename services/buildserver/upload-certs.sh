#!/bin/sh
IMMERSITY_BUILD_HOST=localhost
scp -OP 443 ./immersityxr-local.crt root@$IMMERSITY_BUILD_HOST:/etc/ssl/certs/immersityxr-local.crt
scp -OP 443 ./immersityxr-local.key root@$IMMERSITY_BUILD_HOST:/etc/ssl/private/immersityxr-local.key

ssh -p 443 root@$IMMERSITY_BUILD_HOST 'nginx -s reload'