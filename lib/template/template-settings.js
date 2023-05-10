const settings = require('./settings.json')
const editorTheme = settings.editorTheme || {}
const themeName = editorTheme.theme || 'forge-light'
const themeSettings = settings[themeName] || {}
const { default: got } = require('got')

settings.editorTheme.header = settings.editorTheme.header || {}
settings.editorTheme.header.title = settings.editorTheme.header.title || `Device: ${process.env.FF_DEVICE_NAME}`

const auth = {
    type: 'credentials', // the type of the auth
    tokenHeader: 'x-access-token', // the header where node-red expects to find the token
    tokens: function (token) {
        return new Promise(function (resolve, reject) {
            // call the endpoint to validate the token
            const [prefix, deviceId] = (token + '').split('_')
            if (prefix !== 'ffde' || !deviceId || !token) {
                resolve(null)
                return
            }
            got.get(`${settings.flowforge.forgeURL}/api/v1/devices/${deviceId}/editor/token`, {
                timeout: 2000,
                headers: {
                    'x-access-token': token,
                    'user-agent': 'FlowForge Device Agent Node-RED admin auth'
                }
            }).then((res) => {
                const { username, permissions } = JSON.parse(res.body)
                if (username && permissions) {
                    resolve({ username, permissions })
                    return
                }
                resolve(null)
            }).catch((err) => {
                console.error(err)
                resolve(null)
            })
        })
    },
    users: function (username) {
        return new Promise(function (resolve) {
            resolve(null)
        })
    },
    authenticate: function (username, password) {
        return new Promise(function (resolve) {
            resolve(null)
        })
    },
    default: function () {
        return new Promise(function (resolve) {
            resolve(null)
        })
    }
}

module.exports = {
    flowFile: 'flows.json',
    uiHost: '0.0.0.0',
    uiPort: settings.port,
    adminAuth: auth,
    httpAdminRoot: 'device-editor',
    disableEditor: false, // permit editing of device flows as of FF v1.7.0
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
    },
    [themeName]: { ...themeSettings },
    editorTheme: { ...editorTheme }
}
