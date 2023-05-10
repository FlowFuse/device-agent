const WebSocket = require('ws')
const got = require('got')

function newWsConnection (url, /** @type {WebSocket.ClientOptions} */ options) {
    if (options) {
        return new WebSocket(url, options)
    }
    return new WebSocket(url)
}

async function isWsConnectionReady (ws) {
    const connection = new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                clearInterval(timer)
                resolve(true)
            } else {
                reject(new Error('Connection timeout'))
            }
        }, 200)
    })
    return connection
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

        const forgeURL = new URL(config.forgeURL)
        forgeURL.protocol = forgeURL.protocol === 'http:' ? 'ws:' : 'wss:'
        this.url = forgeURL.toString()
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
        if (this.socket) {
            this.close()
        }
        // * Enable Device Editor (Step 8) - (device->forge:WS) Initiate WS connection (with token)
        const socket = newWsConnection(`${this.url}api/v1/devices/${this.deviceId}/editor/comms/${this.options.token}`, {
            headers: {
                'x-access-token': this.options.token
            }
        })
        socket.onopen = (evt) => {
            socket.on('message', async (message) => {
                // a message from the editor
                const request = JSON.parse(message.toString('utf-8'))
                if (request.ws) {
                    // This is a websocket packet to proxy.
                    if (request.id && request.url) {
                        // This is the initial connect request.
                        const tunnelledWSClient = newWsConnection(`ws://localhost:${thisTunnel.port}/device-editor${request.url}`)
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
                            tunnelledWSClient.on('message', (data) => {
                                const sendData = {
                                    id: request.id,
                                    ws: true,
                                    body: data.toString('utf-8')
                                }
                                socket.send(JSON.stringify(sendData))
                            })
                            while (tunnelledWSClient._messageQueue.length > 0) {
                                tunnelledWSClient.send(tunnelledWSClient._messageQueue.shift())
                            }
                            // tunnelledWSClient.send(JSON.stringify(request)) // TODO: send the request body sent initially?
                        })
                        tunnelledWSClient.on('close', (code, reason) => {
                            console.warn('tunnelledWSClient.onclose', code)
                            thisTunnel.wsClients[request.id]?.removeAllListeners()
                            thisTunnel.wsClients[request.id] = null
                        })
                        tunnelledWSClient.on('error', (err) => {
                            console.error(err)
                            thisTunnel.wsClients[request.id]?.close(1006, err.message)
                            thisTunnel.wsClients[request.id] = null
                        })
                    } else if (thisTunnel.wsClients[request.id]) {
                        thisTunnel.wsClients[request.id].sendOrQueue(request.body)
                    } else {
                        this.close(1006, 'Non-connect packet received for unknown connection id') // 1006 = Abnormal closure
                    }
                } else {
                    const reqHeaders = { ...request.headers }
                    // add bearer token to the request headers
                    if (thisTunnel.options.token) {
                        reqHeaders['x-access-token'] = thisTunnel.options.token
                    }
                    // make request to the local device
                    // add leading slash (if missing)
                    const url = request.url.startsWith('/') ? request.url : `/${request.url || ''}`
                    const fullUrl = `http://localhost:${thisTunnel.port}/device-editor${url}`
                    // ↓ useful for debugging but very noisy
                    // console.log('Making a request to:', fullUrl, 'x-access-token:', request.method, reqHeaders['x-access-token'])
                    got(fullUrl, {
                        headers: reqHeaders,
                        method: request.method,
                        body: request.body,
                        throwErrors: false
                    }).then(response => {
                        // send response back to the forge
                        socket.send(JSON.stringify({
                            id: request.id,
                            headers: response.headers,
                            body: response.rawBody,
                            status: response.statusCode
                        }))
                    }).catch(_err => {
                        // ↓ useful for debugging but noisy due to .map files
                        // console.log(err)
                        // console.log(JSON.stringify(request))
                        socket.send(JSON.stringify({
                            id: request.id,
                            body: undefined,
                            status: 404
                        }))
                    })
                }
            })
        }
        socket.on('close', (code, reason) => {
            console.warn('socket.close', code, reason)
            this.close(code, reason)
        })
        socket.on('error', (err) => {
            console.warn('socket.error', err)
            this.close(1006, err.message) // 1006 = Abnormal Closure
        })
        this.socket = socket
        return !!(await isWsConnectionReady(this.socket))
    }

    close (code, reason) {
        code = code || 1000
        reason = reason || 'Normal Closure'
        // loop through each ws client and close its connection
        Object.keys(this.wsClients || {}).forEach(c => {
            this.wsClients[c]?.close()
            delete this.wsClients[c]
        })

        // // close the tunnel connection
        // if (this.connection) {
        //     this.connection.close()
        //     this.connection.removeAllListeners()
        //     this.connection = null
        // }
        // close the socket
        if (this.socket) {
            this.socket.close()
            this.socket.removeAllListeners()
        }
        this.socket = null
    }
}

module.exports = EditorTunnel
