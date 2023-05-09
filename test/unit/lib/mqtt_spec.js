const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const Aedes = require('aedes')

const { createServer } = require('aedes-server-factory')
const MQTT = require('mqtt')
const { MQTTClient: MQTTClientComms } = require('../../../lib/mqtt')
const EditorTunnel = require('../../../lib/editor/tunnel')

/** creates a mock Agent with sinon fakes for the methods
 * getState, setState, getCurrentFlows, getCurrentCredentials, getCurrentPackage
 * @param {object} opts
 * @param {string} opts.currentMode
 * @param {string} opts.currentSnapshot
 * @param {string} opts.currentProject
 * @param {string} opts.currentSettings
 * @param {string} opts.state
 * @param {object} opts.flows
 * @param {string} opts.credentials
 * @param {string} opts.package
 * @returns {Agent}
 */
function createAgent (opts) {
    opts = opts || {}
    opts.state = opts.state || 'stopped'
    const newAgent = function () {
        this.updating = false
        this.currentMode = opts.currentMode
        this.currentSnapshot = opts.currentSnapshot
        this.currentProject = opts.currentProject
        this.currentSettings = opts.currentSettings
        this.state = opts.currentState
        this.flows = opts.flows
        this.credentials = opts.credentials
        this.package = opts.package
        const agent = this
        return {
            currentMode: agent.currentMode,
            currentSnapshot: agent.currentSnapshot,
            currentProject: agent.currentProject,
            currentSettings: agent.currentSettings,
            getState: sinon.fake.returns(agent.state),
            setState: sinon.fake.call(function (state) {
                agent.state = state
            }),
            getCurrentFlows: sinon.fake.returns(agent.flows),
            getCurrentCredentials: sinon.fake.returns(agent.credentials),
            getCurrentPackage: sinon.fake.returns(agent.package)
        }
    }
    return newAgent()
}

describe('MQTT Comms', function () {
    // common variables
    /** @type {string} agent config dir */ let configDir
    /** @type {import('aedes-server-factory').Server} MQTT WS */ let httpServer
    /** @type {Aedes} MQTT Broker */ let aedes = null
    /** @type {MQTT.MqttClient} MQTT Client */ let mqtt
    /** @type {MQTTClientComms} Agent mqttClient comms */ let mqttClient = null
    let currentId = 0 // incrementing id for each agent
    const sockets = {} // Maintain a hash of all connected sockets (for closing them later)

    function createMQTTClient (opts) {
        opts = opts || {}
        currentId++
        const team = opts.team || `team${currentId}`
        const device = opts.device || `device${currentId}`
        const project = opts.project !== null ? `project${currentId}` : null
        const snapshot = opts.snapshotId !== null ? { id: opts.snapshotId } : null
        const settings = opts.settingsId !== null ? { hash: opts.settingsId } : null
        const mode = opts.mode || 'developer'

        const agent = createAgent({
            currentMode: mode,
            currentProject: project,
            currentSettings: settings,
            currentSnapshot: snapshot,
            state: opts.state || 'stopped',
            flows: opts.flows,
            credentials: opts.credentials,
            package: opts.package
        })

        return new MQTTClientComms(agent, {
            dir: configDir,
            forgeURL: 'http://localhost:9000',
            brokerURL: 'ws://localhost:9001',
            brokerUsername: `device:${team}:${device}`,
            brokerPassword: 'pass'
        })
    }

    before(async function () {
        aedes = new Aedes()
        const port = 9001
        httpServer = createServer(aedes, { ws: true })
        httpServer.listen(port, function () {
            console.log('websocket server listening on port ', port)
        })
        let nextSocketId = 0
        httpServer.on('connection', function (socket) {
        // Add a newly connected socket
            const socketId = nextSocketId++
            sockets[socketId] = socket
            console.log('socket', socketId, 'opened')

            // Remove the socket when it closes
            socket.on('close', function () {
                console.log('socket', socketId, 'closed')
                delete sockets[socketId]
            })
        })

        mqtt = MQTT.connect(`ws://localhost:${port}`)

        try {
            sinon.stub(EditorTunnel, 'create').callsFake(function () {
                return {
                    connect: sinon.stub().returns(true),
                    close: sinon.stub(),
                    dummy: sinon.stub().returns('for ensuring the sandbox is used once')
                }
            })
        } catch (error) {
            console.log(error)
        }
        EditorTunnel.create().dummy() // ensure the sandbox is used once
    })
    after(async function () {
        mqtt && mqtt.end()
        aedes.close()
        aedes.removeAllListeners()
        if (httpServer) {
            // Close the server
            httpServer.close(function () { console.log('Server closed!') })
            // Destroy all open sockets
            for (const socketId in sockets) {
                console.log('socket', socketId, 'destroyed')
                sockets[socketId].destroy()
            }
        }
        sinon.restore()
    })

    beforeEach(async function () {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        mqttClient = createMQTTClient()
    })

    afterEach(async function () {
        await fs.rm(configDir, { recursive: true, force: true })
        mqttClient.stop()
        mqttClient = null
    })

    async function mqttPubAndAwait (topic, payload, responseTopic) {
        return new Promise((resolve, reject) => {
            // if timeout, reject
            const timeOver = setTimeout(() => {
                cleanUp()
                reject(new Error('mqttPubAndAwait timed out'))
            }, 500)
            const onMessage = (topic, message) => {
                const m = JSON.parse(message.toString())
                console.log('mqtt.on(message => received message %s %s', topic, m)
                cleanUp(timeOver)
                resolve(m)
            }
            const cleanUp = () => {
                mqtt.unsubscribe(responseTopic)
                mqtt.off('message', onMessage)
                clearTimeout(timeOver)
            }
            // if message received, resolve
            mqtt.subscribe(responseTopic)
            mqtt.on('message', onMessage)
            // publish message
            mqtt.publish(topic, payload, function (err) {
                if (err) {
                    cleanUp()
                    reject(err)
                }
            })
        })
    }

    it('Creates the MQTT Comms Client', async function () {
        mqttClient.should.have.a.property('agent').and.be.an.Object()
        mqttClient.should.have.a.property('config').and.be.an.Object()
        mqttClient.config.should.have.a.property('dir').and.be.a.String()
        mqttClient.config.should.have.a.property('forgeURL').and.be.a.String()
        mqttClient.config.should.have.a.property('brokerURL').and.be.a.String()
        mqttClient.config.should.have.a.property('brokerUsername').and.be.a.String()
        mqttClient.config.should.have.a.property('brokerPassword').and.be.a.String()
        mqttClient.should.have.a.property('heartbeat').and.be.an.Object()
        mqttClient.should.have.a.property('tunnel').and.be.null()
        mqttClient.should.have.a.property('sentInitialCheckin').and.be.false()
        mqttClient.should.have.a.property('initialCheckinTimeout').and.be.null()
        mqttClient.should.have.a.property('activeProject').and.be.null()
        mqttClient.should.have.a.property('statusTopic').and.be.a.String()
        mqttClient.should.have.a.property('logTopic').and.be.a.String()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String()
        mqttClient.should.have.a.property('responseTopic').and.be.a.String()
        mqttClient.should.have.a.property('brokerConfig').and.be.an.Object()
        mqttClient.brokerConfig.should.have.a.property('clientId').and.be.a.String()
        mqttClient.brokerConfig.should.have.a.property('username').and.be.a.String()
        mqttClient.brokerConfig.should.have.a.property('password').and.be.a.String()
    })
    it('MQTT Client topics are set', async function () {
        const statusTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/status`
        const logTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/logs`
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        mqttClient.should.have.a.property('agent').and.be.an.Object()
        // mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('statusTopic').and.be.a.String().and.equal(statusTopic)
        mqttClient.should.have.a.property('logTopic').and.be.a.String().and.equal(logTopic)
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)
    })
    it('MQTT Comms Client initialises an MQTT Client', async function () {
        mqttClient.start()
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.stop()
    })
    it('MQTT command startEditor gets a response', async function () {
        mqttClient.start()

        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        console.log('commandTopic', commandTopic)
        console.log('responseTopic', responseTopic)
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)

        const payload = {
            command: 'startEditor',
            correlationData: 'correlationData-test',
            responseTopic,
            payload: {
                token: 'token-test'
            }
        }
        const payloadStr = JSON.stringify(payload)

        // short delay to allow mqtt to connect and stack to unwind
        await new Promise(resolve => setTimeout(resolve, 500))
        const response = await mqttPubAndAwait(commandTopic, payloadStr, responseTopic)
        response.should.have.a.property('command', 'startEditor')
        response.should.have.a.property('correlationData', 'correlationData-test')
        response.should.have.a.property('payload').and.be.an.Object()
        response.payload.should.have.a.property('connected', true)
        response.payload.should.have.a.property('token', 'token-test')
        await new Promise(resolve => setTimeout(resolve, 50))
        console.log('done')
    })
    it.skip('MQTT command stopEditor stops the editor', async function () {
        // TODO
    })
    it.skip('MQTT command startLog starts logs', async function () {
        // TODO
    })
    it.skip('MQTT command stopLog stops logs', async function () {
        // TODO
    })
    it.skip('MQTT command upload gets a response with a snapshot', async function () {
        // TODO
    })
})
