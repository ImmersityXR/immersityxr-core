#!/bin/sh
set -e
rc-service sshd start

# initialize WebDAV
# AUTH_FILE=/etc/nginx/webdav_credentials
# > "$AUTH_FILE"

chown -R nginx /home/public

nginx-debug -V
echo ""
# nginx -V | grep -qE "http_dav_module|http-dav-ext"

nginx-debug -g "daemon off;"