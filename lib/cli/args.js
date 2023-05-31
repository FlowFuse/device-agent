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
        description: 'Where the agent should store its state. Default: {underline /opt/flowforge-device}',
        alias: 'd',
        type: String,
        defaultValue: '/opt/flowforge-device',
        typeLabel: '{underline dir}',
        group: 'main'
    },
    {
        name: 'interval',
        alias: 'i',
        type: Number,
        defaultValue: 30,
        typeLabel: '{underline secs}',
        group: 'main'
    },
    {
        name: 'port',
        alias: 'p',
        type: Number,
        defaultValue: 1880,
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
        name: 'moduleCache',
        description: 'Use local npm module cache rather than install',
        type: Boolean,
        alias: 'm',
        group: 'main'
    },
    {
        name: 'webmin',
        description: 'Start the admin web server (optional, does not run by default)',
        type: Boolean,
        defaultValue: false,
        alias: 'w',
        group: 'webmin'
    },
    {
        name: 'webmin-host',
        description: 'Web admin server host. Default: {underline (0.0.0.0)} (listen on all interfaces)',
        type: String,
        defaultValue: '0.0.0.0',
        group: 'webmin'
    },
    {
        name: 'webmin-port',
        description: 'Web admin server port. Default: {underline 1879}',
        type: Number,
        defaultValue: 1879,
        group: 'webmin'
    },
    {
        name: 'webmin-user',
        description: 'Web admin username. Required if --webmin is specified',
        type: String,
        defaultValue: 'admin',
        group: 'webmin',
        requiresArg: true
    },
    {
        name: 'webmin-pass',
        description: 'Web admin password. Required if --webmin is specified',
        type: String,
        defaultValue: 'admin',
        group: 'webmin'
    },
    {
        name: 'webmin-runtime',
        description: 'Time the web admin server is permitted to run. Default: {underline 10}',
        type: Number,
        typeLabel: '{underline mins}',
        defaultValue: 10,
        group: 'webmin'
    }
]
