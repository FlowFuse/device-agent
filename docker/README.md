# FlowFuse Device Agent

This container can be used to start a FlowFuse device. The device needs to
be [registered on your FlowFuse instance](https://flowfuse.com/docs/device-agent/register/).

The YAML with configuration needs to be mounted inside the container.

```
docker run -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest
```

To run with verbose logging run as follows:

```
docker run -d -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest flowfuse-device-agent -v
```

## Logging

By default docker stores all output to stdout and stderr from the container in a single file which can grow large over time.

It is possible to configure docker to do log rolling with the following options

```
docker run -d --log-opt max-size=100m --log-opt max-file=5 --log-opt compress=true -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest flowfuse-device-agent -v
```

- `max-size` is the maximum file size
- `max-file` is the maximum number of files
- `compress` tells docker to compress older files when they are rotated.
