## Local feature branch testing

The image published to a registry installs the released `@flowfuse/device-agent`
package from npm. When testing **local code changes** (e.g. on a feature branch),
you can use the provided helper script to build an image from your branch instead.

The script uses [`Dockerfile.local`](./Dockerfile.local), which packages the local
source with `npm pack` and installs that tarball — mirroring how the production
image installs the published package, but with your changes.

### Building

From the device-agent repo root, run the script:

```bash
# Linux / macOS / Windows Subsystem for Linux (WSL)
# optional: make the script executable:
sudo chmod +x ./docker/build-local.sh
# then run:
./docker/build-local.sh
```

The script will:

- remove any stale `flowfuse-device-agent-*.tgz`
- run `npm pack` to package the local working copy
- build and tag the image based on the current git branch:
  - on `main` &rarr; `flowfuse/device-agent:local-build`
  - on any other branch &rarr; `flowfuse/device-agent:<branch>-local-build`
    (branch lowercased, illegal tag characters replaced with `-`)

You can override the defaults:

```bash
IMAGE_NAME=myorg/device-agent ./docker/build-local.sh   # override repo name
TAG=custom-tag ./docker/build-local.sh                   # override the whole tag
```

### Running

Run exactly as the published image, just using the locally-built tag and
mounting your `device.yml`:

```bash
docker run --rm -it -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:local-build
```

Re-running a build script reassigns the tag to the freshly built image; the
previous build becomes a dangling (`<none>`) image. A running container is not
updated automatically — stop it and `docker run` again to pick up a rebuild.
Clean up old dangling images occasionally with `docker image prune -f`.
