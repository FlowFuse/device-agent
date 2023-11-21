# Deploy Flowfuse Device Agent with Balena

[![balena deploy button](https://www.balena.io/deploy.svg)](https://dashboard.balena-cloud.com/deploy?repoUrl=https://github.com/flowfuse/device-agent&https://github.com/flowfuse/device-agent/balena/balena.yml)

The documentation for the FlowFuse Device Agent can be found [here](https://flowfuse.com/docs/device-agent/introduction/)

## Configure

The FlowFuse Device Agent can be configured in 3 ways:

 1. If started with no configuration file the Device Agent will start a Web Server that will allow a `device.yml` file to be uploaded locally to the Device. The `device.yml` is provided by the FlowFuse platform when the device is created.
 2. A `device.yml` file provided when the Device is created in the FlowFuse platform. This file can be injected into the Belena device using the `FF_DEVICE_YML` environment variable (see below)
 3. A group of Devices can be give a `device.yml` that contains a Provisionig Token. This will cause the Device to connect to the FlowFuse platform and register a new device, it will then download it's own unique `device.yml` file. The Provisioning token can be passed to the Belena device using the `FF_DEVICE_YML` environment variable (see below). Provisioning tokens are created on the Team -> Settings page, under the Device's tab.
    When using a Provisioning Token the Belena Device name will match the FlowFuse Device name.

### Passing configuration via Environment variable

Download either a Device configuration file or a Provisioning token and then Base64 encode this (with no line breaks) using the following command:

```
base64 -w 0 device.yml
```

In the Balena Fleet config set a Variable called `FF_DEVICE_YML` to the output of the base64 command, this can either be on a per device basis for option 2 or fleet wide variable for option 3.

