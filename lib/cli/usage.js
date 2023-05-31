const commandLineUsage = require('command-line-usage')

const version = require('../../package.json').version

module.exports = {
    usage: () => {
        return commandLineUsage([
            {
                header: 'FlowForge Device Agent',
                content: `Run FlowForge instances on a device.\n\n Version: ${version}`
            },
            {
                header: 'Options',
                optionList: require('./args'),
                group: ['main']
            },
            {
                header: 'Web Admin Options',
                optionList: require('./args'),
                group: ['webmin']
            },
            {
                header: 'Global Options',
                optionList: require('./args'),
                group: ['global']
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
