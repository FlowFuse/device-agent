const WebSocketClient = require('websocket').client
// eslint-disable-next-line no-unused-vars
const WebSocket = require('websocket')
const got = require('got')

class EditorTunnel {
    constructor (config, options) {
        this.client = new WebSocketClient()
        /** @type {Object.<string, WebSocket.client>} */
        this.wsClients = {}
        this.deviceId = config.deviceId
        this.port = config.port
        this.config = config
        this.options = options || {}

        const forgeURL = new URL(config.forgeURL)
        forgeURL.protocol = forgeURL.protocol === 'http:' ? 'ws:' : 'wss:'
        this.url = forgeURL.toString()

        const tunnel = this

        /** @type {WebSocket.connection} */
        tunnel.connection = null

        this.client.on('connect', connection => {
            if (tunnel.connection) {
                tunnel.connection.close()
                tunnel.connection.removeAllListeners()
                tunnel.connection = null
            }
            tunnel.connection = connection
            connection.on('message', message => {
                const request = JSON.parse(message.utf8Data)
                if (request.ws) {
                    if (request.id && tunnel.wsClients[request.id]) {
                        tunnel.wsClients[request.id].send(request.body)
                    } else {
                        const tunnelledWSClient = new WebSocketClient()
                        tunnelledWSClient.on('connect', (stream) => {
                            stream.on('message', (msg) => {
                                connection.send(JSON.stringify({
                                    id: request.id,
                                    ws: true,
                                    body: msg.utf8Data
                                }))
                            })

                            stream.on('close', () => {

                            })
                            tunnel.wsClients[request.id] = stream
                        })
                        tunnelledWSClient.on('connectFailed', (err) => {
                            console.log(err)
                        })
                        tunnelledWSClient.connect(`ws://localhost:${tunnel.port}/device-editor${request.url}`)
                    }
                } else {
                    // incoming request from the forge
                    const reqHeaders = { ...request.headers }
                    // add bearer token to the request headers
                    if (tunnel.options.token) {
                        reqHeaders['x-access-token'] = tunnel.options.token
                    }
                    // make request to the local device
                    // add leading slash (if missing)
                    const url = request.url.startsWith('/') ? request.url : `/${request.url || ''}`
                    const fullUrl = `http://localhost:${tunnel.port}/device-editor${url}`
                    // ↓ useful for debugging but very noisy
                    // console.log('Making a request to:', fullUrl, 'x-access-token:', request.method, reqHeaders['x-access-token'])
                    got(fullUrl, {
                        headers: reqHeaders,
                        method: request.method,
                        body: request.body,
                        throwErrors: false
                    }).then(response => {
                        // send response back to the forge
                        connection.send(JSON.stringify({
                            id: request.id,
                            headers: response.headers,
                            body: response.rawBody,
                            status: response.statusCode
                        }))
                    }).catch(_err => {
                        // ↓ useful for debugging but noisy due to .map files
                        // console.log(err)
                        // console.log(JSON.stringify(request))
                        connection.send(JSON.stringify({
                            id: request.id,
                            body: undefined,
                            status: 404
                        }))
                    })
                }
            })

            connection.on('error', (err) => {
                console.log(err)
            })

            connection.on('close', () => {
                Object.keys(tunnel.wsClients).forEach(c => {
                    tunnel.wsClients[c].close()
                })
            })
        })

        this.client.on('connectFailed', err => {
            console.log(err)
        })
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

    connect () {
        // * Enable Device Editor (Step 8) - (device->forge:WS) Initiate WS connection (with token)
        this.client.connect(`${this.url}api/v1/remote/editor/inboundWS/${this.deviceId}/${this.options.token}`, null, null, {
            'x-access-token': this.options.token
        })
        return true
    }

    close () {
        this.client?.abort()
        // loop through each ws client and close its connection
        Object.keys(this.wsClients).forEach(c => {
            this.wsClients[c].removeAllListeners()
            this.wsClients[c].close()
            delete this.wsClients[c]
        })

        // close the tunnel connection
        if (this.connection) {
            this.connection.close()
            this.connection.removeAllListeners()
            this.connection = null
        }
        if (this.client?.socket) {
            this.client.socket.end()
            this.client.socket.removeAllListeners()
            this.client?.socket?.destroy()
        }
        this.client = null
    }
}

module.exports = EditorTunnel
