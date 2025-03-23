#!/bin/sh
set -e
service ssh start
DEBUG= * node serve.js
