const settings = require('./settings.json')
const editorTheme = settings.editorTheme || {}
const themeName = editorTheme.theme || 'forge-light'
const themeSettings = settings[themeName] || {}
const { existsSync, readFileSync } = require('fs')

settings.editorTheme.header = settings.editorTheme.header || {}
settings.editorTheme.header.title = settings.editorTheme.header.title || `Device: ${process.env.FF_DEVICE_NAME}`

const authCache = {}

/**
 * Get proxy agent for HTTP or HTTPS got instance. This should be applied to the `agent` property of the got instance options
 *
 * NOTE: This utility function is specifically designed for the GOT instances where the proxy is set based on the `url`
 *       that the instance will use to make requests. As such, the proxy URL is determined based on the `httpEndPoint` provided
 *       in conjunction with env vars `http_proxy`, `https_proxy` and `no_proxy`.
 * @param {String} url - http or https URL
 * @param {import('http').AgentOptions} proxyOptions - proxy options
 * @returns {{http: import('http-proxy-agent').HttpProxyAgent | undefined, https: import('https-proxy-agent').HttpsProxyAgent | undefined}}
 */
function getHTTPProxyAgent (url, proxyOptions) {
    const agent = {}
    if (url) {
        const _url = new URL(url)
        const proxyFromEnv = require('proxy-from-env')
        const proxyUrl = proxyFromEnv.getProxyForUrl(url)
        if (proxyUrl && _url.protocol === 'http:') {
            const HttpAgent = require('http-proxy-agent').HttpProxyAgent
            agent.http = new HttpAgent(proxyUrl, proxyOptions)
        }
        if (proxyUrl && _url.protocol === 'https:') {
            const HttpsAgent = require('https-proxy-agent').HttpsProxyAgent
            agent.https = new HttpsAgent(proxyUrl, proxyOptions)
        }
    }
    return agent
}

/** @type {import('got').default} */
let got
let agentApplied

const auth = {
    type: 'credentials', // the type of the auth
    tokenHeader: 'x-access-token', // the header where node-red expects to find the token
    tokens: async function (token) {
        const [prefix, deviceId] = (token + '').split('_')
        if (prefix !== 'ffde' || !deviceId || !token) {
            return
        }
        // Check the local cache to see if this token has been verified in the
        // last 30 seconds
        if (authCache[token]) {
            if (Date.now() - authCache[token].ts < 30000) {
                return authCache[token].result
            }
        }

        if (!got) {
            agentApplied = false
            try {
                got = (await import('got')).default
            } catch (_error) { /* ignore */ }
            if (!got) {
                got = require('got').default
            }
        }

        if (!agentApplied && (process.env.https_proxy || process.env.http_proxy)) {
            got = got.extend({
                agent: getHTTPProxyAgent(settings.flowforge.forgeURL, { timeout: 2000 })
            })
        }
        agentApplied = true

        try {
            const result = await got.get(`${settings.flowforge.forgeURL}/api/v1/devices/${deviceId}/editor/token`, {
                timeout: { request: 2000 },
                headers: {
                    'x-access-token': token,
                    'user-agent': 'FlowFuse Device Agent Node-RED admin auth'
                }
            })
            const { username, permissions } = JSON.parse(result.body)
            if (username && permissions) {
                // Cache the successful result
                authCache[token] = {
                    ts: Date.now(),
                    result: { username, permissions }
                }
                return { username, permissions }
            }
        } catch (err) {
            console.log('error getting new token', err)
        }
    },
    users: async function (username) {
        return null
    },
    authenticate: async function (username, password) {
        return null
    }
}

const runtimeSettings = {
    flowFile: 'flows.json',
    uiHost: '0.0.0.0',
    uiPort: settings.port,
    adminAuth: auth,
    httpAdminRoot: 'device-editor',
    disableEditor: false, // permit editing of device flows as of FF v1.7.0
    httpNodeCors: { origin: '*', methods: 'GET,PUT,POST,DELETE' },
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
    nodesDir: settings.nodesDir || null,
    [themeName]: { ...themeSettings },
    editorTheme: { ...editorTheme }
}

if (settings.flowforge.auditLogger?.bin && settings.flowforge.auditLogger?.url) {
    try {
        runtimeSettings.logging.auditLogger = {
            level: 'off',
            audit: true,
            handler: require(settings.flowforge.auditLogger.bin),
            loggingURL: settings.flowforge.auditLogger.url,
            token: settings.flowforge.auditLogger.token
        }
    } catch (e) {
        console.warn('Could not initialise device audit logging. Audit events will not be logged to the platform')
    }
}

if (settings.https) {
    ;['key', 'ca', 'cert'].forEach(key => {
        const filePath = settings.https[`${key}Path`]
        if (filePath && existsSync(filePath)) {
            settings.https[key] = readFileSync(filePath)
        }
    })
    runtimeSettings.https = settings.https
}

if (settings.httpStatic) {
    runtimeSettings.httpStatic = settings.httpStatic
}
module.exports = runtimeSettings
