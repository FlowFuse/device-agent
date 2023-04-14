const WebSocketClient = require('websocket').client
const got = require('got')

class EditorTunnel {
    constructor (config) {
        this.client = new WebSocketClient()
        this.wsClients = {}
        this.deviceId = config.deviceId
        this.port = config.port
        this.config = config

        const forgeURL = new URL(config.forgeURL)
        forgeURL.protocol = forgeURL.protocol === 'http:' ? 'ws:' : 'wss:'
        this.url = forgeURL.toString()

        const tunnel = this

        this.client.on('connect', connection => {
            connection.on('message', message => {
                const request = JSON.parse(message.utf8Data)
                if (request.ws) {
                    if (request.id && tunnel.wsClients[request.id]) {
                        tunnel.wsClients[request.id].send(request.body)
                    } else {
                        const tunnelledWSClient = new WebSocketClient()
                        tunnelledWSClient.on('connect', (conn) => {
                            conn.on('message', (msg) => {
                                connection.send(JSON.stringify({
                                    id: request.id,
                                    ws: true,
                                    body: msg.utf8Data
                                }))
                            })

                            conn.on('close', () => {

                            })
                            tunnel.wsClients[request.id] = conn
                        })
                        tunnelledWSClient.connect(`ws://localhost:${tunnel.port}${request.url}`)
                    }
                } else {
                    console.log(`http://localhost:${tunnel.port}${request.url}`)
                    got(`http://localhost:${tunnel.port}${request.url}`, {
                        headers: request.headers,
                        method: request.method,
                        body: request.body,
                        throwErrors: false
                    }).then(response => {
                        connection.send(JSON.stringify({
                            id: request.id,
                            headers: response.headers,
                            body: response.rawBody,
                            status: response.statusCode
                        }))
                    }).catch(err => {
                        console.log(err)
                        console.log(JSON.stringify(request))
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

    connect () {
        this.client.connect(`${this.url}api/v1/remote/editor/inboundWS/${this.deviceId}`, null, {
            Authorization: `Bearer: ${this.config.token}`
        })
    }
}

module.exports = {
    newEditorTunnel: (config) => new EditorTunnel(config),
    EditorTunnel
}
