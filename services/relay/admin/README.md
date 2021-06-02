# komodo-relay-monitor

Demo Video: https://uofi.box.com/s/q7gulguhbjl90aumx1mdml8vp4uobc7l

`cd <pathTo...>/komodo-relay-monitor`

`npx serve .`

Open a browser and go to the RELAY_BASE_URL specified in index.js.

Run a komodo-relay server that talks to that same RELAY_BASE_URL.

* Refer to examples/serve.js for how the SocketIO admin namespace is set up.

Run a komodo-unity build and have it talk to the same RELAY_BASE_URL.

It will poll periodically.

