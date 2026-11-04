const mocha = require('mocha') // eslint-disable-line
require('should')
const http = require('http')
const { WebSocketServer } = require('ws')
const EditorTunnel = require('../../../../lib/editor/tunnel')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor (check, timeout = 5000) {
    const start = Date.now()
    while (!check()) {
        if (Date.now() - start > timeout) {
            throw new Error('Timed out waiting for condition')
        }
        await sleep(20)
    }
}

describe('Editor Tunnel', function () {
    this.timeout(15000)

    let server
    let wss
    let tunnel
    let rejectStatus
    let cookies
    let upgradeCount

    beforeEach(async function () {
        rejectStatus = null
        cookies = []
        upgradeCount = 0
        wss = new WebSocketServer({ noServer: true })
        wss.on('headers', headers => {
            const cookie = cookies[upgradeCount - 1]
            if (cookie) {
                headers.push(`Set-Cookie: FFSESSION=${cookie}; Path=/`)
            }
        })
        server = http.createServer((req, res) => res.end())
        server.on('upgrade', (req, socket, head) => {
            upgradeCount++
            if (rejectStatus) {
                socket.end(`HTTP/1.1 ${rejectStatus} Rejected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`)
                return
            }
            wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
        })
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    })

    afterEach(async function () {
        tunnel?.close()
        tunnel = null
        wss.clients.forEach(ws => ws.terminate())
        wss.close()
        await new Promise(resolve => server.close(resolve))
    })

    function createTunnel (options = {}) {
        const forgeURL = `http://127.0.0.1:${server.address().port}`
        return EditorTunnel.create({ deviceId: 'device1', forgeURL, port: 1880 }, { token: 'token1', ...options })
    }

    it('keeps reconnecting after the platform rejects a reconnect attempt', async function () {
        tunnel = createTunnel()
        const connected = await tunnel.connect()
        connected.should.be.true()

        // Simulate the platform restarting behind a proxy
        rejectStatus = 502
        tunnel.reconnectDelay = 50
        wss.clients.forEach(ws => ws.terminate())

        await waitFor(() => upgradeCount >= 2)
        wss.clients.size.should.equal(0)

        // Platform is back
        rejectStatus = null
        await waitFor(() => wss.clients.size === 1)
        upgradeCount.should.be.above(2)
    })

    it('reports a new affinity cookie received on reconnect', async function () {
        cookies = ['first-instance', 'second-instance']
        const reported = []
        tunnel = createTunnel({ onAffinityChange: affinity => reported.push(affinity) })
        await tunnel.connect()
        tunnel.affinity.should.equal('first-instance')

        tunnel.reconnectDelay = 50
        wss.clients.forEach(ws => ws.terminate())

        await waitFor(() => reported.length === 2)
        reported.should.eql(['first-instance', 'second-instance'])
        tunnel.affinity.should.equal('second-instance')
    })

    it('does not report the affinity cookie when it has not changed', async function () {
        cookies = ['same-instance', 'same-instance']
        const reported = []
        tunnel = createTunnel({ affinity: 'same-instance', onAffinityChange: affinity => reported.push(affinity) })
        await tunnel.connect()

        tunnel.reconnectDelay = 50
        wss.clients.forEach(ws => ws.terminate())

        await waitFor(() => wss.clients.size === 1 && upgradeCount === 2)
        reported.should.have.length(0)
    })
})
