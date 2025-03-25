#!/bin/sh
set -e
rc-service sshd start
nginx-debug -V
nginx-debug -g "daemon off;"