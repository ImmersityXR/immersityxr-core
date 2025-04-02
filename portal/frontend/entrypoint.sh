#!/bin/sh
ls -a | grep -w "\.env\.production"
if $? ; then
    echo "missing .env.production file"
fi

ls -a | grep -w "\.env\.development"
if $? ; then
    echo "missing .env.development file"
fi
