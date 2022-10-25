# FlowForge Device Agent

This module provides an agent that runs Node-RED projects deployed from the
FlowForge platform.

## Prerequisites

 - NodeJS v16
 - A FlowForge platform instance to connect to

The agent does not support running on Windows.

## Install

The agent can be installed as a global npm module. This will ensure the agent
command is on the path:

```
npm install -g @flowforge/flowforge-device-agent
```

## Configuration

The agent configuration is provided in a `device.yml` file within its working
directory.


### Configuration directory

By default the agent uses `/opt/flowforge-device` as its working directory. 
This can be overridden with the `-d/--dir` option.

The directory must exist and be accessible to the user that will be
running the agent.

```
sudo mkdir /opt/flowforge-device
sudo chown -R $USER /opt/flowforge-device
```

### `device.yml`

When the device is registered on the FlowForge platform, a group of configuration
details are provided. These can be copied from the platform, or downloaded directly
as a yml file.

This file should be copied into the working directory as `device.yml`.

A different config file can be specified with the `-c/--config` option.

The file must contain the following options (these are the ones provided by 
FlowForge)

Required options   | Description
-------------------|---------------
`deviceId`         | The id for the device on the FlowForge platform
`token`            | Access Token to connect to the FF platform
`credentialSecret` | Key to decrypt the flow credentials
`forgeURL`         | The base url of the FlowForge platform

To enable MQTT connectivity, the following options are required. They are provided
by the platform if MQTT comms are enabled.

MQTT options   | Description
---------------|---------------
`brokerURL`      | The url for the platform broker
`brokerUsername` | The username to connect with - `device:<teamId>:<deviceId>`
`brokerPassword` | The password to connect with

The following options can be added:

Extra options   | Description
----------------|---------------
`interval`      | How often, in seconds, the agent checks in with the platform. Default: 60s
`intervalJitter`| How much, in seconds, to vary the heartbeat +/- `intervalJitter`. Default: 10s
`port`          | The port to listen on. Default: 1880

## Running

If the agent was installed as a global npm module, the command 
`flowforge-device-agent` will be on the path.

If the default working directory and config file are being used, then the agent
can be started with:

```
$ flowforge-device-agent
```

For information about the available command-line arguments, run with `-h`:

```
Options

  -c, --config file     Device configuration file. Default: device.yml
  -d, --dir dir         Where the agent should store its state. Default: /opt/flowforge-device
  -i, --interval secs
  -p, --port number

Global Options

  -h, --help       print out helpful usage information
  --version        print out version information
  -v, --verbose    turn on debugging output
```

## Running as a service

An example service file is provided [here](https://github.com/flowforge/flowforge-device-agent/tree/main/service).
