/** @type {import('command-line-args').OptionDefinition[]} */
module.exports = [
    {
        name: 'config',
        alias: 'c',
        description: 'Device configuration file. Default: {underline device.yml}',
        type: String,
        defaultValue: 'device.yml',
        typeLabel: '{underline file}',
        group: 'main'
    },
    {
        name: 'dir',
        description: 'Where the agent should store its state. Default: {underline /opt/flowfuse-device}',
        alias: 'd',
        type: String,
        // Set default to blank so we can distinguish between it being left as
        // default, and a user setting it explicitly via -d
        defaultValue: '',
        typeLabel: '{underline dir}',
        group: 'main'
    },
    {
        name: 'interval',
        alias: 'i',
        type: Number,
        defaultValue: 60,
        typeLabel: '{underline secs}',
        group: 'main'
    },
    {
        name: 'port',
        alias: 'p',
        type: Number,
        typeLabel: '{underline number}',
        group: 'main'
    },
    {
        name: 'help',
        description: 'print out helpful usage information',
        type: Boolean,
        alias: 'h',
        group: 'global'
    },
    {
        name: 'version',
        description: 'print out version information',
        type: Boolean,
        group: 'global'
    },
    {
        name: 'verbose',
        description: 'turn on debugging output',
        type: Boolean,
        alias: 'v',
        group: 'global'
    },
    {
        name: 'installer-mode',
        description: 'enables the installer mode used by the FlowFuse Device Agent Installer',
        type: Boolean,
        group: 'global'
    },
    {
        name: 'moduleCache',
        description: 'Use local npm module cache rather than install',
        type: Boolean,
        alias: 'm',
        group: 'main'
    },
    {
        name: 'ui',
        description: 'Start the Web UI Server (optional, does not run by default)',
        type: Boolean,
        alias: 'w',
        group: 'ui'
    },
    {
        name: 'ui-host',
        description: 'Web UI server host. Default: {underline (0.0.0.0)} (listen on all interfaces)',
        type: String,
        group: 'ui'
    },
    {
        name: 'ui-port',
        description: 'Web UI server port. Default: {underline 1879}',
        type: Number,
        group: 'ui'
    },
    {
        name: 'ui-user',
        description: 'Web UI username. Required if --ui is specified',
        type: String,
        group: 'ui',
        requiresArg: true
    },
    {
        name: 'ui-pass',
        description: 'Web UI password. Required if --ui is specified',
        type: String,
        group: 'ui'
    },
    {
        name: 'ui-runtime',
        description: 'Time the Web UI server is permitted to run. Default: {underline 10}',
        type: Number,
        typeLabel: '{underline mins}',
        defaultValue: 10,
        group: 'ui'
    },
    {
        name: 'otc',
        description: 'Setup device using a one time code',
        type: String,
        alias: 'o',
        typeLabel: '{underline string}',
        group: 'setup'
    },
    {
        name: 'otc-no-start',
        description: 'Do not start the agent after setup',
        type: Boolean,
        // defaultValue: false,
        group: 'setup'
    },
    {
        name: 'otc-no-import',
        description: 'Do not ask to import Node-RED flows during setup',
        type: Boolean,
        group: 'setup'
    },
    {
        name: 'ff-url',
        description: 'URL of FlowFuse. Required for setup',
        type: String,
        alias: 'u',
        typeLabel: '{underline url}',
        group: 'setup'
    },
    {
        name: 'heap-size',
        description: 'Node-RED NodeJS Old Space Size in mb. Default 512',
        type: Number,
        group: 'main'
    }
]
