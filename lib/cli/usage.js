const commandLineUsage = require('command-line-usage')

const version = require('../../package.json').version

module.exports = {
    usage: () => {
        return commandLineUsage([
            {
                header: 'FlowFuse Device Agent',
                content: `Run FlowFuse instances on a device.\n\n Version: ${version}`
            },
            {
                header: 'Options',
                optionList: require('./args'),
                group: ['main']
            },
            {
                header: 'Web UI Options',
                optionList: require('./args'),
                group: ['ui']
            },
            {
                header: 'Setup command',
                optionList: require('./args'),
                group: ['setup']
            },
            {
                header: 'Global Options',
                hide: ['installer-mode'],
                optionList: require('./args'),
                group: ['global']
            },
            {
                header: 'Project Home',
                content: '{underline https://github.com/FlowFuse/device-agent}'
            }
        ])
    }
}
/*
*/
