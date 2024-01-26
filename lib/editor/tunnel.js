const { info, warn, debug } = require('../logging/log')
const WebSocket = require('ws')
const got = require('got')

function newWsConnection (url, /** @type {WebSocket.ClientOptions} */ options) {
    if (options) {
        return new WebSocket(url, options)
    }
    return new WebSocket(url)
}

class EditorTunnel {
    constructor (config, options) {
        // this.client = new WebSocketClientOLD()

        /** @type {Object.<string, WebSocket.client>} */

        // this.client = new WebSocket()
        /** @type {Object.<string, WebSocket>} */
        this.wsClients = {}
        this.deviceId = config.deviceId
        this.port = config.port
        this.config = config
        this.options = options || {}
        this.affinity = undefined

        // How long to wait before attempting to reconnect. Start at 500ms - back
        // off if connect fails
        this.reconnectDelay = 500

        const forgeURL = new URL(config.forgeURL)
        forgeURL.protocol = forgeURL.protocol === 'http:' ? 'ws:' : 'wss:'
        this.url = forgeURL.toString()

        this.localProtocol = config.https ? 'https' : 'http'
        this.localWSProtocol = config.https ? 'wss' : 'ws'
    }

    /**
     * Create a tunnel instance
     * @param {Object} config tunnel configuration
     * @param {string} config.deviceId device id
     * @param {string} config.token device token
     * @param {string} config.forgeURL forge URL
     * @param {number} config.port port to tunnel to
     * @returns {EditorTunnel} tunnel instance
     */
    static create (config, options) {
        return new EditorTunnel(config, options)
    }

    async connect () {
        const thisTunnel = this
        let unexpectedPacketMonitor = 0
        if (this.socket) {
            this.close()
        }
        const forgeWSEndpoint = `${this.url}api/v1/devices/${this.deviceId}/editor/comms/${this.options.token}`
        info(`Connecting editor tunnel to ${forgeWSEndpoint}`)

        // * Enable Device Editor (Step 8) - (device->forge:WS) Initiate WS connection (with token)
        const headers = {
            'x-access-token': this.options.token
        }
        if (this.affinity) {
            headers.cookie = `FFSESSION=${this.affinity}`
        }
        const socket = newWsConnection(forgeWSEndpoint, {
            headers
        })
        socket.on('upgrade', (evt) => {
            if (evt.headers && evt.headers['set-cookie']) {
                let cookies = evt.headers['set-cookie']
                if (!Array.isArray(cookies)) {
                    cookies = [cookies]
                }
                cookies.forEach(cookie => {
                    const parts = cookie.split(';')[0].split(['='])
                    if (parts[0] === 'FFSESSION') {
                        this.affinity = parts[1]
                    }
                })
            }
        })
        socket.onopen = (evt) => {
            unexpectedPacketMonitor = 0
            info('Editor tunnel connected')
            // Reset reconnectDelay
            this.reconnectDelay = 500
            this.socket.on('message', async (message) => {
                // a message coming over the tunnel from a remote editor
                const request = JSON.parse(message.toString('utf-8'))
                if (request.ws) {
                    // A websocket related event
                    if (request.id !== undefined && request.url) {
                        // An editor has created a new comms connection.
                        // Create a corresponding local connection to the
                        // local runtime
                        const localWSEndpoint = `${thisTunnel.localWSProtocol}://127.0.0.1:${thisTunnel.port}/device-editor${request.url}`
                        debug(`[${request.id}] Connecting local comms to ${localWSEndpoint}`)

                        const tunnelledWSClient = newWsConnection(localWSEndpoint, { rejectUnauthorized: false })
                        thisTunnel.wsClients[request.id] = tunnelledWSClient
                        tunnelledWSClient._messageQueue = []
                        tunnelledWSClient.sendOrQueue = function (payload) {
                            if (this.readyState !== WebSocket.OPEN) {
                                this._messageQueue.push(payload)
                            } else {
                                this.send(payload)
                            }
                        }
                        tunnelledWSClient._id = request.id // for debugging and tracking

                        tunnelledWSClient.on('open', () => {
                            debug(`[${request.id}] Local comms connected`)
                            tunnelledWSClient.on('message', (data) => {
                                // The runtime is sending a message to an editor
                                const sendData = {
                                    id: request.id,
                                    ws: true,
                                    body: data.toString('utf-8')
                                }
                                // console.log(`[${request.id}] R>E`, sendData.body)
                                if (this.socket?.readyState === WebSocket.OPEN) {
                                    this.socket.send(JSON.stringify(sendData))
                                }
                            })
                            // Now the local comms is connected, send anything
                            // that had got queued up whilst we were getting
                            // connected
                            while (tunnelledWSClient._messageQueue.length > 0) {
                                tunnelledWSClient.send(tunnelledWSClient._messageQueue.shift())
                            }
                        })

                        tunnelledWSClient.on('close', (code, reason) => {
                            debug(`[${request.id}] Local comms connection closed code=${code} reason=${reason}`)
                            // WS to local node-red has closed. Send a notification
                            // to the platform so it can close the proxied editor
                            // websocket to match
                            if (this.socket?.readyState === WebSocket.OPEN) {
                                this.socket.send(JSON.stringify({
                                    id: request.id,
                                    ws: true,
                                    closed: true
                                }))
                            }
                            thisTunnel.wsClients[request.id]?.removeAllListeners()
                            thisTunnel.wsClients[request.id] = null
                        })
                        tunnelledWSClient.on('error', (err) => {
                            warn(`[${request.id}] Local comms connection error`)
                            warn(err)
                            thisTunnel.wsClients[request.id]?.close(1006, err.message)
                            thisTunnel.wsClients[request.id] = null
                        })
                    } else if (thisTunnel.wsClients[request.id]) {
                        // A message relating to an existing comms connection
                        if (request.closed) {
                            // An editor has closed its websocket - so we should
                            // close the corresponding local connection
                            debug(`[${request.id}] Closing local comms connection`)
                            thisTunnel.wsClients[request.id].close()
                        } else {
                            // An editor has sent a message over the websocket
                            // - forward over the local connection
                            // console.log(`[${request.id}] E>R`, request.body)
                            const wsClient = thisTunnel.wsClients[request.id]
                            let body = request.body
                            if (/\/comms$/.test(wsClient.url)) {
                                if (/^{"auth":/.test(body)) {
                                    // This is the comms auth packet. Substitute the active
                                    // access token
                                    body = `{"auth":"${this.options.token}"}`
                                }
                            }
                            wsClient.sendOrQueue(body)
                        }
                    } else {
                        if (unexpectedPacketMonitor > 1) {
                            unexpectedPacketMonitor = 0
                            warn(`[${request.id}] Unexpected editor comms packet ${JSON.stringify(request, null, 4)}`)
                            this.close(1006, 'Non-connect packet received for unknown connection id') // 1006 = Abnormal closure
                        } else {
                            unexpectedPacketMonitor++
                        }
                    }
                } else {
                    // An http related event
                    const reqHeaders = { ...request.headers }
                    // add bearer token to the request headers
                    if (thisTunnel.options.token) {
                        reqHeaders['x-access-token'] = thisTunnel.options.token
                    }
                    // make request to the local device
                    // add leading slash (if missing)
                    const url = request.url.startsWith('/') ? request.url : `/${request.url || ''}`
                    const fullUrl = `${thisTunnel.localProtocol}://127.0.0.1:${thisTunnel.port}/device-editor${url}`
                    // ↓ useful for debugging but very noisy
                    // console.log('Making a request to:', fullUrl, 'x-access-token:', request.method, reqHeaders['x-access-token'])
                    // debug(`proxy [${request.method}] ${fullUrl}`)
                    // debug(`body ${request.body}`)
                    let body = request.body
                    if (body && body[0] === '"') {
                        try {
                            body = JSON.parse(body)
                        } catch (err) {
                            // ignore
                        }
                    }
                    const options = {
                        headers: reqHeaders,
                        method: request.method,
                        body,
                        throwErrors: false
                    }
                    if (thisTunnel.localProtocol === 'https') {
                        options.https = { rejectUnauthorized: false }
                    }
                    got(fullUrl, options).then(response => {
                        // debug(`proxy [${request.method}] ${fullUrl} : sending response: status ${response.statusCode}`)
                        // send response back to the forge
                        if (this.socket?.readyState === WebSocket.OPEN) {
                            this.socket.send(JSON.stringify({
                                id: request.id,
                                headers: response.headers,
                                body: response.rawBody,
                                status: response.statusCode
                            }))
                        }
                    }).catch(_err => {
                        // debug(`proxy [${request.method}] ${fullUrl} : error ${_err.toString()}`)
                        // ↓ useful for debugging but noisy due to .map files
                        // console.log(_err)
                        // console.log(JSON.stringify(request))
                        if (this.socket?.readyState === WebSocket.OPEN) {
                            this.socket.send(JSON.stringify({
                                id: request.id,
                                body: undefined,
                                status: 404
                            }))
                        }
                    })
                }
            })
        }
        socket.on('close', async (code, reason) => {
            if (Buffer.isBuffer(reason)) {
                reason = reason.toString()
            }
            // The socket connection to the platform has closed
            info(`Editor tunnel closed code=${code} reason=${reason}`)
            socket.removeAllListeners()
            this.socket = null
            clearTimeout(this.reconnectTimeout)
            // Pre 1.12, FF returned '1008/No Tunnel' - but 1008 was also used
            // for other scenarios, so we have to check both code and reason text.
            // 1.12+ returns '4004/No Tunnel' - where 4004 is only used for this
            // scenario so we don't have to worry about the text (which could change in the future).
            if ((code === 1008 && reason !== 'No tunnel') || code !== 4004) {
                // Assume we need to be reconnecting. If this close is due
                // to a request from the platform to turn off editor access,
                // .close will get called
                const reconnectDelay = this.reconnectDelay
                // Bump the delay for next time... 500ms, 1.5s, 4.5s, 10s 10s 10s...
                this.reconnectDelay = Math.min(this.reconnectDelay * 3, 10000)
                this.reconnectTimeout = setTimeout(() => {
                    this.connect()
                }, reconnectDelay)
            } else {
                // A 4004/'No tunnel' response means the platform doesn't think
                // we should be connecting - so no point retrying
                this.close(code, reason)
            }
        })
        socket.on('error', (err) => {
            warn(`Editor tunnel error: ${err}`)
            console.warn('socket.error', err)
            this.close(1006, err.message) // 1006 = Abnormal Closure
        })
        this.socket = socket
        return !!(await this.waitForConnection())
    }

    close (code, reason) {
        code = code || 1000
        reason = reason || 'Normal Closure'
        // loop through each local comms ws client and close its connection
        Object.keys(this.wsClients || {}).forEach(c => {
            this.wsClients[c]?.close()
            delete this.wsClients[c]
        })

        // close the socket
        if (this.socket) {
            this.socket.close()
            // Remove the event listeners so we don't trigger the reconnect
            // handling
            this.socket.removeAllListeners()
            info('Editor tunnel closed')
        }
        this.socket = null
        // ensure any active timers are stopped
        clearInterval(this.connectionReadyInterval)
        clearTimeout(this.reconnectTimeout)
    }

    async waitForConnection () {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()
            clearInterval(this.connectionReadyInterval)
            // Poll every 2 seconds, but timeout after 10
            this.connectionReadyInterval = setInterval(() => {
                if (this.socket) {
                    if (this.socket.readyState === WebSocket.OPEN) {
                        clearInterval(this.connectionReadyInterval)
                        resolve(true)
                    } else if (this.socket.readyState !== WebSocket.CONNECTING || Date.now() - startTime > 10000) {
                        // Stop polling if readyState is CLOSING/CLOSED, or we've been
                        // trying to connect to over 10s
                        if (this.socket.readyState === WebSocket.CONNECTING) {
                            // Timed out - close the socket
                            try {
                                this.socket.close()
                            } catch (err) {
                            }
                        }
                        clearInterval(this.connectionReadyInterval)
                        resolve(false)
                    }
                } else {
                    clearInterval(this.connectionReadyInterval)
                    resolve(false)
                }
            }, 2000)
        })
    }
}

module.exports = EditorTunnel
