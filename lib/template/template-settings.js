const settings = require('./settings.json')

module.exports = {
    flowFile: 'flows.json',
    uiHost: '0.0.0.0',
    uiPort: settings.port,
    httpAdminRoot: false,
    disableEditor: true,
    externalModules: {
        autoInstall: true,
        palette: {
            allowInstall: true
        },
        modules: {
            allowInstall: true
        }
    },
    credentialSecret: settings.credentialSecret,
    flowforge: settings.flowforge,
    contextStorage: {
        default: 'memory',
        memory: { module: 'memory' },
        persistent: { module: 'localfilesystem' }
    }
}
