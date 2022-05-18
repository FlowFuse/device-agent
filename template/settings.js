const settings = require('./settings.json')

module.exports = {
    flowFile: 'flows.json',
    uiHost: '127.0.0.1',
    httpAdminRoute: false,
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
    credentialSecret: settings.credentialSecret
}
