#!/bin/sh
set -e
rc-service sshd start
nginx-debug -g "daemon off;"