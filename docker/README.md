# FlowForge Device Agent

This container can be used to start a FlowForge device. The device needs to
be [registered on your FlowForge instance](https://flowforge.com/docs/user/devices/#register-the-device).

The YAML with configuration needs to be mounted inside the container.

```
docker run -v /path/to/device.yml:/opt/flowforge-device/device.yml -p 1880:1880 flowforge/device-agent:latest
```

To run with verbose logging run as follows:

```
docker run -v /path/to/device.yml:/opt/flowforge-device/device.yml -p 1880:1880 flowforge/device-agent:latest flowforge-device-agent -v
```