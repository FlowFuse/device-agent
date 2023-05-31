const fs = require('fs')
const path = require('path')
const ConfigLoader = require('../lib/config')

const REALM = 'Basic Authentication'

// #region Types
/**
 * @typedef {import('./server').WebServer} WebServer
 * @typedef {import('http').RequestListener} RequestListener
 * @typedef {import('http').IncomingMessage | {$router: Router, $route: WebServerRoute} } WebServerRequest
 * @typedef {import('http').ServerResponse} WebServerResponse
 * @typedef {(
 *    req: WebServerRequest,
 *    res: WebServerResponse,
 * ) => void} WebServerRouteHandler
 */

/**
 * @typedef {Object} WebServerRoute
 * @property {string} name
 * @property {string} method
 * @property {string} path
 * @property {WebServer} server
 * @property {Router} router
 * @property {WebServerRouteHandler} handler
 */
// #endregion

// #region Routes
/** @type {WebServerRoute[]} */
const routes = [
    {
        name: 'index',
        method: 'GET',
        path: '/',
        handler: (req, res) => {
            if (!isAuthorized(req)) {
                return respondWith401AuthRequired(res)
            }
            // this.token = generateToken(32)
            // res.setHeader('authorization', this.token)
            // redirect to home page
            res.writeHead(302, { Location: '/home' })
            res.end()
        }
    },
    {
        name: 'home',
        method: 'GET',
        path: '/home',
        handler: (req, res) => {
            if (!isAuthorized(req)) {
                // redirect to index
                res.writeHead(302, { Location: '/' })
                res.end()
                return
            }
            // res.setHeader('authorization', this.token)

            res.writeHead(200, { 'Content-Type': 'text/html' })
            const homePage = path.join(__dirname, 'home.html')
            const homePageData = fs.readFileSync(homePage, 'utf8')
            res.write(homePageData)
            res.end()
        }
    },
    {
        name: 'assets',
        method: 'GET',
        path: '/assets/*',
        handler: (req, res) => {
            const assetPath = path.join(__dirname, req.url)
            if (!fs.existsSync(assetPath)) {
                res.writeHead(404)
                res.end()
                return
            }
            // determine content type from file extension
            const ext = path.extname(assetPath)
            const contentType = contentTypeForExtension(ext)
            if (!contentType) {
                // unknown/restricted file type
                res.writeHead(404)
                res.end()
                return
            }

            if (!contentType) {
                // unknown/restricted file type
                res.writeHead(404)
                res.end()
                return
            }
            // read the file using the correct encoding
            const bufferEnc = encodingForContentType(contentType)
            const assetData = fs.readFileSync(assetPath, bufferEnc)
            res.writeHead(200, { 'Content-Type': contentType })
            res.write(assetData, bufferEnc)
            res.end()
        }
    },
    {
        name: 'status',
        method: 'GET',
        path: '/status',
        handler: (req, res) => {
            if (!isAuthorized(req)) {
                // send json response with error
                res.writeHead(401, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Unauthorized' }))
                return
            }
            // send json response with status
            res.writeHead(200, { 'Content-Type': 'application/json' })
            const agent = req.$router.server.agentManager?.agent || {}
            const agentLoaded = !!req.$router.server.agentManager?.agent
            const options = req.$router.server.agentManager?.options || {}
            const config = agent.config || {}
            const env = agent.currentSettings?.env || {}
            const status = {
                state: agentLoaded ? agent.currentState : 'stopped',
                name: env.FF_DEVICE_NAME,
                type: env.FF_DEVICE_TYPE,
                mode: agent.currentMode,
                version: options.version,
                snapshotName: agent.currentSnapshot?.name,
                snapshotDesc: agent.currentSnapshot?.description || undefined,
                deviceClock: Date.now(),
                // curated config view
                config: {
                    deviceId: config.deviceId,
                    forgeURL: config.forgeURL,
                    dir: options.dir,
                    deviceFile: options.deviceFile,
                    port: options.port,
                    provisioningMode: config.provisioningMode,
                    provisioningName: config.provisioningName,
                    provisioningTeam: config.provisioningTeam
                }
            }
            res.end(JSON.stringify({ success: true, status }))
        }
    },
    {
        name: 'submit',
        method: 'POST',
        path: '/submit',
        handler: (req, res) => {
            if (!isAuthorized(req)) {
                return respondWith401Denied(res)
            }
            let body = ''
            req.on('data', function (data) {
                body += data
            })
            req.on('end', function () {
                // decode data sent by xhr.send('{ "config": "???" }')
                const bodyData = decodeURIComponent(body)
                const parsedBody = JSON.parse(bodyData)
                // check the supplied data is a valid config
                const parsedConfig = ConfigLoader.parseDeviceConfig(parsedBody.config)
                if (parsedConfig.valid === false) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: parsedConfig.message }))
                    return
                }

                // write file to disk
                fs.writeFile(req.$router.options.deviceFile, parsedBody.config, (err) => {
                    if (err) {
                        res.writeHead(400, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ error: err }))
                        return
                    }
                    // at this point, the config file has been written to disk. Reload the agent.
                    req.$router.server.agentManager.reloadAgent(200, (err, state) => {
                        if (err) {
                            res.writeHead(400, { 'Content-Type': 'application/json' })
                            res.end(JSON.stringify({ error: err, state }))
                            return
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ success: true, state }))
                    })
                })
            })

            req.on('error', function (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: err }))
            })
        }
    }
]
// #endregion

// #region Router
class Router {
    constructor () {
        this.options = {}
        /** @type {WebServerRoute[]} */
        this.routes = []
        /** @type {import('./server').WebServer} */
        this.server = null
        this.credentials = null
    }

    initialise (server, options) {
        this.routes = []
        this.server = server
        this.options = options || {}
        this.credentials = this.options.credentials ? { ...this.options.credentials } : null
        this.runtime = this.options.runtime
        this.startTime = Date.now()
        const _routes = this.options.routes || routes
        for (const _route of _routes) {
            const route = { ..._route }
            route.router = this
            route.server = server
            route.name = route.name || route.path
            _route.handler = route.handler.bind(this)
            this.routes.push(route)
        }
    }

    /** @type {RequestListener} */
    requestListener (req, res) {
        let matchRoute = this.routes.find(route => route.method === req.method && route.path === req.url)
        if (!matchRoute) {
            matchRoute = this.routes.find(route => route.method === req.method && req.url.startsWith(route.path.slice(0, -1)) && route.path.endsWith('*'))
        }
        try {
            if (matchRoute) {
                req.$route = matchRoute
                req.$router = matchRoute.router || this
                matchRoute.handler(req, res)
            } else {
                res.writeHead(404)
                res.end(JSON.stringify({ error: 'Not found' }))
            }
        } catch (err) {
            console.error(err)
            res.writeHead(500)
            res.end(JSON.stringify({ error: 'Internal server error' }))
        }
    }
}
// #endregion

// #region Helpers
/**
 * Writes a 401 response to the client and requests authentication
 * @param {import('http').ServerResponse} res
 * @returns {null}
 */
function respondWith401AuthRequired (res) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="' + REALM + '"' })
    res.end('Authorization required')
    return null
}

/**
 * Writes a 401 response to the client and denies access
 * @param {import('http').ServerResponse} res
 * @returns {null}
 */
function respondWith401Denied (res) {
    // send json response with error
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return null
}

/**
 * Checks if the request is authorized
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 * @private
 */
function isAuthorized (req) {
    const credentials = req.$router.credentials || { }
    const auth = req.headers.authorization
    if (!auth) {
        return false
    }
    const parts = auth.split(' ')
    const method = parts[0]
    const encoded = parts[1]
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const [username, password] = decoded.split(':')
    return (method === 'Basic' && username === credentials.username && password === credentials.password)
}

// function generateToken (length, prefix) {
//     const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
//     const charsLength = chars.length
//     let token = prefix || ''
//     for (let i = 0; i < length; i++) {
//         token += chars.charAt(Math.floor(Math.random() * charsLength))
//     }
//     return token
// }

/**
 * Determines the encoding for a given content type
 * @param {string} contentType - The content type to determine the encoding for
 * @returns {string} - The encoding for the given content type
 */
function encodingForContentType (contentType) {
    switch (contentType) {
    case 'text/plain':
    case 'text/html':
    case 'text/css':
    case 'application/json':
    case 'application/x-yaml':
        return 'utf8'
    default:
        return 'binary'
    }
}

/**
 * Determines the content type for a given file extension
 * If the file extension is not recognised, null is returned (i.e. unsupported file type)
 * @param {string} ext - The file extension
 * @returns {string} - the content type for the given file extension
 */
function contentTypeForExtension (ext) {
    switch (ext) {
    case '.txt':
    case '.log':
        return 'text/plain'
    case '.json':
        return 'application/json'
    case '.yaml':
    case '.yml':
        return 'application/x-yaml'
    case '.pdf':
        return 'application/pdf'
    case '.css':
        return 'text/css'
    case '.html':
        return 'text/html'
    case '.png':
        return 'image/png'
    case '.jpg':
    case '.jpeg':
        return 'image/jpeg'
    case '.gif':
        return 'image/gif'
    case '.svg':
        return 'image/svg+xml'
    case '.ico':
        return 'image/x-icon'
    }
    return null
}
// #endregion

module.exports = {
    Router
}
