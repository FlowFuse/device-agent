const commandLineUsage = require('command-line-usage')

const version = require('../package.json').version

module.exports = {
    usage: () => {
        return commandLineUsage([
            {
                header: 'FlowForge Device Agent',
                content: `Run FlowForge projects on a device.\n\n Version: ${version}`
            },
            {
                header: 'Options',
                optionList: require('./args'),
                group: [ 'main' ]
            },
            {
                header: 'Global Options',
                optionList: require('./args'),
                group: [ 'global' ]
            },
            {
                header: 'Project Home',
                content: '{underline https://github.com/flowforge/flowforge-device-agent}'
            }
        ])
    }
}
/*
*/
