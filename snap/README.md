[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-white.svg)](https://snapcraft.io/flowforge-device-agent)

# FlowForge Device Agent Snap Package

This is the README file for the FlowForge Device Agent Snap package, which allows you to manage Node-RED instances running on remote devices using the FlowForge platform. The snap package includes the device agent and configuration files necessary for connecting to a FlowForge platform instance and receiving updates.

For the complete documentation see the [README file](https://github.com/flowforge/flowforge-device-agent#flowforge-device-agent) of the npm package and the [FlowForge Website](https://flowforge.com/docs/user/devices/)

## Installation

To install the FlowForge Device Agent Snap package, run the following command:

```
sudo snap install flowforge-device-agent
```

## Configuration

1. The agent's configuration is provided in a `device.yml` file. The Snap package ensures that a writable directory exists in `$SNAP_USER_DATA/flowforge-device`
2. Copy the `device.yml` file provided by the FlowForge platform to the writable directory at `$SNAP_USER_DATA/flowforge-device/device.yml` or modify the template.

## Usage

Start the FlowForge Device Agent with the following command:

```
flowforge-device-agent.device-agent
```

## Documentation

More information on our website [FlowForge Website](https://flowforge.com/docs/user/devices/)
