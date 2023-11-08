# FlowFuse Device Agent

This container can be used to start a FlowFuse device. The device needs to
be [registered on your FlowFuse instance](https://flowfuse.com/docs/device-agent/register/).

The YAML with configuration needs to be mounted inside the container.

```
docker run -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest
```

To run with verbose logging run as follows:

```
docker run -v /path/to/device.yml:/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest flowfuse-device-agent -v
```