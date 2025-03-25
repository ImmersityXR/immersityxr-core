#!/bin/sh
set -e
rc-service sshd start
nginx-debug -TV -g "daemon off;"