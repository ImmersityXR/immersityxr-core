#!/bin/sh
set -e
service ssh start
nginx -g daemon off;