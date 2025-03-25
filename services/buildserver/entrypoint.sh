#!/bin/sh
set -e
openrc default
rc-update add sshd
rc-service sshd start
nginx -g daemon off;