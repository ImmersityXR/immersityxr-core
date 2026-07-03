#!/bin/sh
# Warn (without failing the build) when the env files that bake in the
# service URLs are absent - see docs/PORTAL.md for how to create them.
if [ ! -f .env.production ]; then
    echo "warning: missing .env.production file"
fi

if [ ! -f .env.development ]; then
    echo "warning: missing .env.development file"
fi
