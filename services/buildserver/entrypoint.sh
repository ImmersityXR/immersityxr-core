#!/bin/sh
set -e
rc-service sshd start
nginx -g daemon off;