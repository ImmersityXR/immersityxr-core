#!/bin/sh
# Zip, transfer, unzip './builds/latest' folder.
# The -k flag means to not overwrite existing files.
tar -c ./builds/latest | ssh -p 443 root@localhost 'tar -kxvf - -C /usr/share/nginx/html/builds/latest'
