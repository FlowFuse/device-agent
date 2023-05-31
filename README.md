# FlowForge Device Agent

This module provides an agent that runs Node-RED instances deployed from the
FlowForge platform.

## Prerequisites

 - NodeJS v16
 - A FlowForge platform instance to connect to

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

#### linux/macOS

```
sudo mkdir /opt/flowforge-device
sudo chown -R $USER /opt/flowforge-device
```

#### windows (run elevated)

```
mkdir c:\opt\flowforge-device
```


### `device.yml` - for a single device

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
`moduleCache`   | If the device can not access npmjs.org then use the node modules cache in `module_cache` directory. Default `false`


### `device.yml` - for provisioning

When a device should be auto registered on the FlowForge platform, a group of provisioning
configuration details are required. These are generated for you in FlowForge
**Team Settings** under the **Devices** tab when you create a provisioning token.
These can be copied from the platform, or downloaded directly as a yml file.

This file should be copied into the working directory as `device.yml`.

A different config file can be specified with the `-c/--config` option.

The file must contain the following options (these are the ones provided by 
FlowForge)

Required options    | Description
--------------------|---------------
`provisioningName`  | The name of the token
`provisioningTeam`  | The team this device will be registered to
`provisioningToken` | Provisioning Token to connect to the FF platform
`forgeURL`          | The base url of the FlowForge platform

The following options can be added:

Extra options   | Description
----------------|---------------
`interval`      | How often, in seconds, the agent checks in with the platform. Default: 60s
`intervalJitter`| How much, in seconds, to vary the heartbeat +/- `intervalJitter`. Default: 10s

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
  -m, --moduleCache     Use local npm module cache rather than install

Web Admin Options

  -w, --webmin            Start the admin web server (optional, does not run by default)
  --webmin-host string    Web admin server host. Default: (0.0.0.0) (listen on all interfaces)
  --webmin-port number    Web admin server port. Default: 1879
  --webmin-user string    Web admin username. Required if --webmin is specified
  --webmin-pass string    Web admin password. Required if --webmin is specified
  --webmin-runtime mins   Time the web admin server is permitted to run. Default: 10

Global Options

  -h, --help       print out helpful usage information
  --version        print out version information
  -v, --verbose    turn on debugging output
```

## Running with no access to npmjs.org

By default the Device Agent will try and download the correct version of Node-RED and 
any nodes required to run the Instance Snapshot that is assigned to run on the device.

If the device is being run on an offline network or security policies prevent the 
Device Agent from connecting to npmjs.org then it can be configured to use a pre-cached 
set of modules.

You can enable this mode by adding `-m` to the command line adding `moduleCache: true` 
to the `device.yml` file. This will cause the Device Agent to load the modules from the 
`module_cache` directory in the Device Agents Configuration directory as described above.
By default this will be `/opt/flowforge-device/module_cache`.

### Creating a module cache

To create a suitable module cache, you will need to install the modules on a local device with
access to npmjs.org, ensuring you use the same OS and Architecture as your target
device, and then copy the modules on to your device.

1. From the Instance Snapshot page, select the snapshot you want to deploy and select the option to download its `package.json` file.
2. Place this file in an empty directory on your local device.
3. Run `npm install` to install the modules. This will create a `node_modules` directory.
4. On your target device, create a directory called `module_cache` inside the Device Agent Configuration directory.
5. Copy the `node_modules` directory from your local device to the target device so that it is under the `module_cache` directory.

## Running as a service

An example service file is provided [here](https://github.com/flowforge/flowforge-device-agent/tree/main/service).

## Running the agent with the web admin enabled

The agent can be run with a web admin interface. This is an optional feature and
is not enabled by default.  The web admin permits the user to view the current
status of the agent and the Node-RED instances it is running.  It also permits
the user to download a device configuration or a provisioning configuration file.

To enable the web admin, use the `-w/--webmin` option. This will start a web server on
the specified host and port. The default host is `0.0.0.0` and the default port is `1879`.

When enabling the web admin, a username and password must be provided with the
`--webmin-user` and `--webmin-pass` options.

The web admin will only be available for the duration specified by the `--webmin-runtime`. By
default this is 10 minutes. After this time, the web admin will be disabled.  You can set this
to `0` to disable the timeout. This is not recommended.
