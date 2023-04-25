const settings = require('./settings.json')
const editorTheme = settings.editorTheme || {}
const themeName = editorTheme.theme || 'forge-light'
const themeSettings = settings[themeName] || {}

const auth = {
    type: 'credentials',
    tokenHeader: 'x-access-token',
    // tokenHeader: 'authorization',
    tokens: function (token) {
        return new Promise(function (resolve, reject) {
            // check token is valid
            // TODO: Consider calling the an auth service endpoint to validate the token
            // against the temp auto generated ffde_ token (`tunnelManager.verifyToken(deviceId, token)`)
            // as it stands, local access wont work anyway since the token is passed in the header
            // on ws connect and validated upon tunnelling connection. The worst that can happen is the
            // link is shared and the tunnel is left open
            const valid = true
            if (valid) {
                // return auth.users('forge')
                resolve({ username: 'forge', permissions: '*' })
                return
            }
            resolve(null)
        })
    },
    users: function (username) {
        return new Promise(function (resolve) {
            if (username === 'forge') {
                resolve({ username: 'forge', permissions: '*' })
            } else if (username === 'viewer') {
                resolve({ username: 'viewer', permissions: 'read' })
            } else {
                resolve(null)
            }
        })
    },
    authenticate: function (username, password) {
        return new Promise(function (resolve) {
            const valid = username === 'forge' // && password === 'admin'
            if (valid) {
                const user = { username: 'forge', permissions: '*' }
                resolve(user)
            } else {
                // Resolve with null to indicate the username/password pair
                // were not valid.
                resolve(null)
            }
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
