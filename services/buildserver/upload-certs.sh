#!/bin/sh
scp -OP 443 ./immersityxr-local.crt root@localhost:/etc/ssl/certs/immersityxr-local.crt
scp -OP 443 ./immersityxr-local.key root@localhost:/etc/ssl/private/immersityxr-local.key

ssh -p 443 root@localhost 'nginx -s reload'