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
    },
    logging: {
        console: {
            level: 'info',
            metric: false,
            audit: false,
            handler: () => {
                const levelNames = {
                    10: 'fatal',
                    20: 'error',
                    30: 'warn',
                    40: 'info',
                    50: 'debug',
                    60: 'trace',
                    98: 'audit',
                    99: 'metric'
                }
                return (msg) => {
                    let message = msg.msg
                    try {
                        if (typeof message === 'object' && message !== null && message.toString() === '[object Object]' && message.message) {
                            message = message.message
                        }
                    } catch (e) {
                        message = 'Exception trying to log: ' + message
                    }
                    console.log(JSON.stringify({
                        ts: Date.now(),
                        level: levelNames[msg.level],
                        type: msg.type,
                        name: msg.name,
                        id: msg.id,
                        msg: message
                    }))
                }
            }
        }
    }
}
