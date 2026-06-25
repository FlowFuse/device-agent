#!/usr/bin/env bash
# Builds a local-testing image of the device-agent from the current working copy.
#
#   - clears any stale flowfuse-device-agent-*.tgz
#   - runs `npm pack` to package the local code
#   - tags the image based on the current git branch:
#       main            -> flowfuse/device-agent:local-build
#       <other-branch>  -> flowfuse/device-agent:<branch>-local-build
#
# Usage (from anywhere):
#   ./docker/build-local.sh
#   IMAGE_NAME=myorg/device-agent ./docker/build-local.sh   # override repo name
#   TAG=custom-tag ./docker/build-local.sh                   # override the whole tag

# Fail fast: -e exits on any command error, -u errors on unset variables,
# -o pipefail makes a pipeline fail if any stage (not just the last) fails.
set -euo pipefail

# Generate a default image name and tag if not supplied by the caller.
IMAGE_NAME="${IMAGE_NAME:-flowfuse/device-agent}"
TAG="${TAG:-}"

# Resolve the device-agent repo root (parent of this script's /docker dir) and work from there.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# 1. Clear any old tarballs so only the fresh pack remains.
for f in flowfuse-device-agent-*.tgz; do
    if [ -e "$f" ]; then
        echo "Removing old pack: $f"
        rm -f "$f"
    fi
done

# 2. Package the local working copy.
echo "Running npm pack..."
npm pack

# 3. Work out the tag from the branch name (unless one was supplied).
if [ -z "$TAG" ]; then
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ "$branch" = "main" ]; then
        TAG="local-build"
    else
        # Sanitise: lowercase, and replace anything not allowed in a docker tag with '-'
        safe_branch="$(echo "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_.-]/-/g')"
        TAG="${safe_branch}-local-build"
    fi
fi

FULL_IMAGE="${IMAGE_NAME}:${TAG}"

# 4. Build the image (context = repo root, so the .tgz is reachable by COPY).
echo "Building image: $FULL_IMAGE"
docker build -f docker/Dockerfile.local -t "$FULL_IMAGE" .

echo ""
echo "Built $FULL_IMAGE"
echo ""
echo "Enter the following command to run the device-agent:"
echo "  docker run --rm -it \\"
echo "    -v /opt/flowfuse-device-docker-local/device.yml:/opt/flowfuse-device/device.yml \\"
echo "    -p 1888:1880 \\"
echo "    $FULL_IMAGE"
echo ""
echo "NOTE:"
echo "Entering the above command will run the device-agent on port 1888"
echo "using your local device.yml (edit as needed before hitting enter)"
