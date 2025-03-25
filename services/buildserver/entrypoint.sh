#!/bin/sh
rc-service sshd start
nginx-debug -TV -g "daemon off;"