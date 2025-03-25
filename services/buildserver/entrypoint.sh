#!/bin/sh
set -e
rc-service sshd start
nginx -V -g "daemon off;"