#!/bin/sh
set -e
# Socket.IO/Engine.IO debug output is off by default: on Socket.IO 4 it logs
# every packet. Set DEBUG (e.g. DEBUG=socket.io:*) to turn it on.
exec node serve.js
