# Immersity Buildserver

An nginx static file server for Unity WebGL builds. It serves a `builds`
directory containing the versioned (and custom) builds of the Immersity VR
client.

## Deployment

The buildserver runs as the `immersity-buildserver` service in
[`deploy/docker-compose.yml`](../../deploy/docker-compose.yml), built from
this directory and routed through the Traefik proxy at the deployment's
root domain. The compose file mounts `deploy/immersity-buildserver/builds/`
into the container at `/usr/share/nginx/html`.

See the [deploy README](../../deploy/README.md) for how to download builds
from the [immersityxr-unity releases page](https://github.com/ImmersityXR/immersityxr-unity/releases),
place them in the builds directory, and create clean URLs with symlinks.

## Uploading builds

nginx has WebDAV enabled (`default.conf` allows PUT/DELETE), and
`upload-build.sh <directory> <host>` uploads a build directory with curl.

**Note:** WebDAV has no authentication of its own. Keep it unreachable
through the proxy, or copy builds to the server with scp/SFTP instead —
see the security checklist in [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
