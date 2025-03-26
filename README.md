# FlowFuse Device Agent

This module provides an agent that runs Node-RED instances deployed from the
FlowFuse platform.

## Prerequisites

 - NodeJS v18 or later
 - A FlowFuse platform to connect to

 For users that require NodeJS v14 and v16 support the v2.x stream will work.

## Supported Operating Systems

The Device Agent can be installed on most Linux distributions, Windows, and MacOS.

## Installing the Device Agent

The Device Agent is published to the public npm repository as [@flowfuse/device-agent](https://www.npmjs.com/package/@flowfuse/device-agent).

It can be installed as a global npm module. This will ensure the agent command is on the path.

Note: previous versions of the agent were published as `@flowforge/flowforge-device-agent`.

### Linux/MacOS

```bash
sudo npm install -g @flowfuse/device-agent
```

### Windows

```bash
npm install -g @flowfuse/device-agent
```

### Docker

We publish a Docker container for the Device Agent as `flowfuse/device-agent` on DockerHub.

When running with the container you will need to mount the `device.yml` obtained when [Registering the device](#register-the-device):

```bash
docker run --mount type=bind,src=/path/to/device.yml,target=/opt/flowfuse-device/device.yml -p 1880:1880 flowfuse/device-agent:latest
```

## Configuration

The agent configuration is provided by a `device.yml` file within its working
directory.


### Configuration directory

By default the agent uses `/opt/flowfuse-device` or `c:\opt\flowfuse-device` as 
its working directory. This can be overridden with the `-d/--dir` option.

For backwards compatibility with previous versions, the agent will use `/opt/flowforge-device`
if it is exists, unless overridden on the command-line.

NOTE: The device agent will attempt to create the working directory if it is not found,
however if an error occurs, the device agent will exit and report a startup error.

#### Linux/MacOS

```bash
sudo mkdir /opt/flowfuse-device
sudo chown -R $USER /opt/flowfuse-device
```

#### Windows (run elevated)

```bash
mkdir c:\opt\flowfuse-device
```


### `device.yml` - for a single device

When the device is registered on the FlowFuse platform, a group of configuration
details are provided. These can be copied from the platform, downloaded directly
as a yml file or pulled from the FlowFuse server using the command issued by the
platform when you create a device. More details on this can be found
in the [FlowFuse documentation](https://flowfuse.com/docs/device-agent/introduction/).

This file should exist in the working directory as `device.yml`.

A different config file can be specified with the `-c/--config` option.

The file must contain the following options (these are the ones provided by 
FlowFuse)

Required options   | Description
-------------------|---------------
`deviceId`         | The id for the device on the FlowFuse platform
`token`            | Access Token to connect to the FF platform
`credentialSecret` | Key to decrypt the flow credentials
`forgeURL`         | The base url of the FlowFuse platform

To enable MQTT connectivity, the following options are required. They are provided
by the platform if MQTT comms are enabled.

MQTT options     | Description
-----------------|---------------
`brokerURL`      | The url for the platform broker
`brokerUsername` | The username to connect with - `device:<teamId>:<deviceId>`
`brokerPassword` | The password to connect with

The following options can be added:

Extra options   | Description
----------------|---------------
`interval`      | How often, in seconds, the agent checks in with the platform. Default: 60s
`intervalJitter`| How much, in seconds, to vary the heartbeat +/- `intervalJitter`. Default: 10s
`moduleCache`   | If the device can not access npmjs.org then use the node modules cache in `module_cache` directory. Default `false`


#### Node-RED options

The following options are passed through to Node-RED:

Node-RED options | Description
-----------------|---------------
`port`           | The port to listen on. Default: 1880
`https`          | Enable HTTPS. See below for details
`httpStatic`     | Enable serving of static content from a local path
`httpNodeAuth`   | If set, any endpoints created in Node-RED flows will require this username and password to access them. Default: `false`
`localAuth`      | When configured, local login is possible

##### `https` configuration

The `https` configuration option can be used to enable HTTPS within Node-RED. The values
are passed through to the [Node-RED `https` setting](https://nodered.org/docs/user-guide/runtime/configuration).

The `ca`, `key` and `cert` properties can be used to provide custom certificates and keys.
The values should be set to the contents of the certificate/key.

Alternatively, the properties `caPath`, `keyPath` and `certPath` can be used instead
to provide absolute paths to files containing the certificates/keys.

```yml
https:
   keyPath: /opt/flowfuse-device/certs/key.pem
   certPath: /opt/flowfuse-device/certs/cert.pem
   caPath: /opt/flowfuse-device/certs/ca.pem
```

##### `httpStatic` configuration

This option can be used to serve content from a local directory.

If set to a path, the files in that directory will be served relative to `/`.

```yml
httpStatic: /opt/flowfuse-device/static-content
```

It is also possible to configure it with a list of directories and the corresponding
path they should be served from.

```yml
httpStatic:
  - path: /opt/flowfuse-device/static-content/images
    root: /images
  - path: /opt/flowfuse-device/static-content/js
    root: /js
```

##### `httpNodeAuth` configuration

This option can be used to apply basic auth to HTTP endpoints created in Node-RED.
This will also protect node-red-dashboard.
Full details can be found in [HTTP Node security documentation](https://nodered.org/docs/user-guide/runtime/securing-node-red#http-node-security).

Example:
```yml
httpNodeAuth:
   user: user
   pass: $2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.
```

##### `localAuth` configuration

The recommended way to securely access the Node-RED editor is via FlowFuse platform.
However, if you want to enable local login within Node-RED, you can use the `localAuth` configuration.

Example:
```yml
localAuth:
   user: user
   pass: $2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.
```

NOTE: `localAuth.enabled` can be set to `false` to disable local login without the need to remove the `user` and `pass` properties.


### `device.yml` - for provisioning

When a device should be auto registered on the FlowFuse platform, a group of provisioning
configuration details are required. These are generated for you in FlowFuse
**Team Settings** under the **Devices** tab when you create a provisioning token.
These can be copied from the platform, or downloaded directly as a yml file.

This file should be copied into the working directory as `device.yml`.

A different config file can be specified with the `-c/--config` option.

The file must contain the following options (these are the ones provided by 
FlowFuse)

Required options    | Description
--------------------|---------------
`provisioningName`  | The name of the token
`provisioningTeam`  | The team this device will be registered to
`provisioningToken` | Provisioning Token to connect to the FF platform
`forgeURL`          | The base url of the FlowFuse platform

The following options can be added:

Extra options   | Description
----------------|---------------
`interval`      | How often, in seconds, the agent checks in with the platform. Default: 60s
`intervalJitter`| How much, in seconds, to vary the heartbeat +/- `intervalJitter`. Default: 10s

## Running

If the agent was installed as a global npm module, the command 
`flowfuse-device-agent` will be on the path.

If the default working directory and config file are being used, then the agent
can be started with:

```
$ flowfuse-device-agent
```

For information about the available command-line arguments, run with `-h`:

```
Options

  -c, --config file     Device configuration file. Default: device.yml
  -d, --dir dir         Where the agent should store its state. Default: /opt/flowfuse-device
  -i, --interval secs
  -p, --port number
  -m, --moduleCache     Use local npm module cache rather than install

Web UI Options

  -w, --ui            Start the Web UI Server (optional, does not run by default)
  --ui-host string    Web UI server host. Default: (0.0.0.0) (listen on all interfaces)
  --ui-port number    Web UI server port. Default: 1879
  --ui-user string    Web UI username. Required if --ui is specified
  --ui-pass string    Web UI password. Required if --ui is specified
  --ui-runtime mins   Time the Web UI server is permitted to run. Default: 10

Setup command

  -o, --otc string   Setup device using a one time code
  -u, --ff-url url   URL of FlowFuse. Required for setup

Global Options

  -h, --help       print out helpful usage information
  --version        print out version information
  -v, --verbose    turn on debugging output
```

## Running with no access to npmjs.org

By default the Device Agent will try and download the correct version of Node-RED and 
any nodes required to run the Snapshot that is assigned to run on the device.

If the device is being run on an offline network or security policies prevent the 
Device Agent from connecting to npmjs.org then it can be configured to use a pre-cached 
set of modules.

You can enable this mode by adding `-m` to the command line adding `moduleCache: true` 
to the `device.yml` file. This will cause the Device Agent to load the modules from the 
`module_cache` directory in the Device Agents Configuration directory as described above.
By default this will be `/opt/flowfuse-device/module_cache`.

### Creating a module cache

To create a suitable module cache, the device must be assigned to an instance.  You will need to
install the modules on a local device with access to npmjs.org, ensuring you use the same
OS and Architecture as your target device, and then copy the modules on to your device.

1. From the Instance Snapshot page, select the snapshot you want to deploy and select the option to download its `package.json` file.
2. Place this file in an empty directory on your local device.
3. Run `npm install` to install the modules. This will create a `node_modules` directory.
4. On your target device, create a directory called `module_cache` inside the Device Agent Configuration directory.
5. Copy the `node_modules` directory from your local device to the target device so that it is under the `module_cache` directory.

## Running as a service

An example service file is provided [here](https://github.com/FlowFuse/device-agent/tree/main/service).

## Running the agent with the Web UI enabled

The Device Agents Web UI is provided to enable the user to download a device
configuration or a provisioning configuration file. This is an optional feature and
is not enabled by default.

To enable the UI, use the `-w/--ui` option. This will start a web server on
the specified host and port. The default host is `0.0.0.0` and the default port is `1879`.

When enabling the UI, a username and password must be provided with the
`--ui-user` and `--ui-pass` options.

The UI will only be available for the duration specified by the `--ui-runtime`. By
default this is 10 minutes. After this time, the web server will be disabled. The 
application must be restarted to re-enable the UI. You can set this to `0` to 
disable the timeout. This is not recommended.

## Development

### Scripts

The following scripts are available:

 - `npm start` - Start the agent
 - `npm run dev` - Build the agent and watch for changes
 - `npm run lint` - Run eslint
 - `npm run lint:fix` - Run eslint and fix any issues
 - `npm run test` - Run all unit tests
 - `npm run test:lib` - Run the unit tests for the lib
 - `npm run test:frontend` - Run the unit tests for the frontend
