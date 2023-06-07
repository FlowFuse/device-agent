const http = require('http')
const { Router } = require('./routes.js')
const { info } = require('../lib/log')

class WebServer {
    constructor () {
        /** @type {http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>} */
        this.server = null
        /** @type {Router} */
        this.router = null
        this.onErrorHandler = null
        this.options = null
    }

    initialize (agentManager, options, listeningHandler, closeHandler, errorHandler) {
        this.options = options || {}
        this.onErrorHandler = errorHandler
        this.onListeningHandler = listeningHandler
        this.onCloseHandler = closeHandler
        try {
            this.agentManager = agentManager
            this.router = new Router()
            this.router.initialise(this, this.options || {})
            this.server = http.createServer(this.router.requestListener.bind(this.router))

            this.server.on('error', (error) => {
                if (this.onErrorHandler) {
                    this.onErrorHandler(error)
                } else {
                    info('Web UI error:', error.message)
                }
            })

            this.server.on('listening', () => {
                if (this.onListeningHandler) {
                    this.onListeningHandler(this.server.address())
                } else {
                    const listenerAddress = Object.assign({}, this.server.address(), {
                        address: this.options.host || 'localhost',
                        port: this.options.port,
                        family: ''
                    })
                    listenerAddress.family = listenerAddress.address.includes(':') ? 'IPv6' : 'IPv4'
                    if (listenerAddress.address === '0.0.0.0') {
                        listenerAddress.address = '127.0.0.1'
                    } else if (listenerAddress.address === '::' || listenerAddress.address === '::1') {
                        listenerAddress.address = '[::1]'
                    }
                    listenerAddress.hyperlink = `http://${listenerAddress.address}:${listenerAddress.port}`
                    info(`Web UI Server now listening at ${listenerAddress.hyperlink}`)
                }
            })

            this.server.on('close', () => {
                if (this.onCloseHandler) {
                    this.onCloseHandler()
                } else {
                    info('Web UI closed')
                }
            })

            return this // for chaining
        } catch (err) {
            console.error(err)
        }
        return null
    }

    async start () {
        // promisify the server listen method
        const listen = (server, port, host) => new Promise((resolve, reject) => {
            server.listen(port, host, (err) => {
                if (err) {
                    reject(err)
                }
                resolve()
            })
        })
        const { port, host } = this.options
        let runtime = this.options.runtime
        if (runtime === 0) {
            // 0 means no timeout
        }
        if (typeof runtime !== 'number' || Number.isNaN(runtime) || runtime === Infinity || runtime === -Infinity || runtime < 0) {
            runtime = 10 // default to 10 minutes
        }
        if (!this.options.credentials?.username || !this.options.credentials?.password) {
            throw new Error('Missing credentials')
        }
        if (runtime === 0) {
            // no end time specified
        } else {
            this.runtimeTimer = setTimeout(async () => {
                try {
                    await this.stop()
                } catch (error) {
                    console.error(error)
                }
            }
            , runtime * 60 * 1000)
        }
        return listen(this.server, port, host)
    }

    async stop () {
        this.runtimeTimer && clearTimeout(this.runtimeTimer)
        // promisify the server close method
        const close = (server) => new Promise((resolve, reject) => {
            if (!server || !server.close) {
                resolve()
                return
            }
            server.close((err) => {
                if (err) {
                    reject(err)
                }
                resolve()
            })
        })
        return close(this.server)
    }

    async destroy () {
        try {
            await this.stop()
            this.server?.removeAllListeners()
        } catch (err) {
            console.error(err)
        } finally {
            this.server = null
        }
    }

    // property getters
    get listening () {
        return !!this.server?.listening
    }
}

module.exports = {
    WebServer
}
