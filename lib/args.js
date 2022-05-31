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
    }

]
