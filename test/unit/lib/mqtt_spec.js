const mocha = require('mocha') // eslint-disable-line
const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const Aedes = require('aedes')
const { createProxy } = require('proxy')
const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
const { createServer } = require('aedes-server-factory')
const MQTT = require('mqtt')
const { MQTTClient: MQTTClientComms } = require('../../../lib/mqtt')
const EditorTunnel = require('../../../lib/editor/tunnel')
const port = 9800 // MQTT broker port
const proxyPort = port + 1 // HTTP(s) proxy port for MQTT
const proxyHost = '127.0.0.2' // works for localhost
let currentId = 0 // incrementing id for each agent

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
        this.currentMode = opts.currentMode || null
        this.editorToken = opts.editorToken
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
            editorToken: agent.editorToken,
            currentSnapshot: agent.currentSnapshot,
            currentProject: agent.currentProject,
            currentSettings: agent.currentSettings,
            getState: sinon.fake.returns(agent.state),
            setState: sinon.fake.call(function (state) {
                agent.state = agent.state || {}
                agent.state = Object.assign({}, agent.state, state)
            }),
            getCurrentFlows: sinon.fake.returns(agent.flows),
            getCurrentCredentials: sinon.fake.returns(agent.credentials),
            getCurrentPackage: sinon.fake.returns(agent.package),
            saveEditorToken: sinon.fake(),
            startNR: sinon.fake.returns(true),
            restartNR: sinon.fake.returns(true),
            suspendNR: sinon.fake.returns(true),
            checkIn: sinon.fake()
        }
    }
    return newAgent()
}

/**
 * Create a new MQTTClientComms instance
 * @param {*} opts - lib/mqtt options
 * @param {string} opts.team - team id
 * @param {string} opts.device - device id
 * @param {string} opts.project - project id
 * @param {string} opts.snapshotId - snapshot id
 * @param {string} opts.settingsId - settings id
 * @param {string} opts.mode - mode
 * @param {string} opts.editorToken - editor token
 * @param {string} opts.state - state
 * @param {object} opts.flows - flows
 * @param {string} opts.credentials - credentials
 * @param {string} opts.package - package
 */
function createMQTTClient (configDir, opts) {
    opts = opts || {}
    currentId++
    const team = opts.team || `team${currentId}`
    const device = opts.device || `device${currentId}`
    const project = opts.project !== null ? `project${currentId}` : null
    const snapshot = opts.snapshotId !== null ? { id: opts.snapshotId } : null
    const settings = opts.settingsId !== null ? { hash: opts.settingsId } : null
    const mode = opts.mode || 'developer'
    const editorToken = opts.editorToken || null

    const agent = createAgent({
        currentMode: mode,
        editorToken,
        currentProject: project,
        currentSettings: settings,
        currentSnapshot: snapshot,
        state: opts.state || 'stopped',
        flows: opts.flows,
        credentials: opts.credentials,
        package: opts.package
    })

    const daMQTT = new MQTTClientComms(agent, {
        dir: configDir,
        forgeURL: 'http://localhost:9000',
        brokerURL: 'ws://localhost:' + port,
        brokerUsername: `device:${team}:${device}`,
        brokerPassword: 'pass'
    })

    sinon.stub(daMQTT.heartbeat, 'start')
    return daMQTT
}

async function _mqttPubAndAwait (mqttClient, topic, payload, responseTopic) {
    return new Promise((resolve, reject) => {
        // if timeout, reject
        const timeOver = setTimeout(() => {
            cleanUp()
            reject(new Error('mqttPubAndAwait timed out'))
        }, 500)
        const onMessage = (topic, message) => {
            const m = JSON.parse(message.toString())
            // console.log('mqtt.on(message => received message %s %s', topic, m)
            cleanUp(timeOver)
            resolve(m)
        }
        const cleanUp = () => {
            mqttClient.unsubscribe(responseTopic || topic)
            mqttClient.off('message', onMessage)
            clearTimeout(timeOver)
        }
        // if message received, resolve
        mqttClient.subscribe(responseTopic || topic)
        mqttClient.on('message', onMessage)
        // publish message
        mqttClient.publish(topic, payload, function (err) {
            if (err) {
                cleanUp()
                reject(err)
            }
        })
    })
}

describe('MQTT Comms', function () {
    // common variables
    /** @type {string} agent config dir */ let configDir
    /** @type {import('aedes-server-factory').Server} MQTT WS */ let httpServer
    /** @type {Aedes} MQTT Broker */ let aedes = null
    /** @type {MQTT.MqttClient} MQTT Client */ let mqtt
    /** @type {import('../../../lib/mqtt').MQTTClient} Agent mqttClient comms */ let mqttClient = null
    // let currentId = 0 // incrementing id for each agent
    const sockets = {} // Maintain a hash of all connected sockets (for closing them later)

    before(async function () {
        aedes = new Aedes()
        httpServer = createServer(aedes, { ws: true })
        httpServer.listen(port, function () {
            // console.log('websocket server listening on port ', port)
        })
        let nextSocketId = 0
        httpServer.on('connection', function (socket) {
        // Add a newly connected socket
            const socketId = nextSocketId++
            sockets[socketId] = socket
            // console.log('socket', socketId, 'opened')

            // Remove the socket when it closes
            socket.on('close', function () {
                // console.log('socket', socketId, 'closed')
                delete sockets[socketId]
            })
        })

        mqtt = MQTT.connect(`ws://localhost:${port}`, {
            clientId: 'testsuite-' + Date.now(),
            username: 'device:team:device',
            password: 'pass',
            protocol: 'ws'
        })

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
            httpServer.close(function () { /* console.log('Server closed!') */ })
            // Destroy all open sockets
            for (const socketId in sockets) {
                // console.log('socket', socketId, 'destroyed')
                sockets[socketId].destroy()
            }
        }
        sinon.restore()
    })

    beforeEach(async function () {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        mqttClient = createMQTTClient(configDir)
        sinon.stub(console, 'log') // hush console.log
        sinon.stub(console, 'info') // hush console.info
    })

    afterEach(async function () {
        await fs.rm(configDir, { recursive: true, force: true })
        mqttClient.stop()
        mqttClient = null
        console.log.restore()
        console.info.restore()
        if (process.env.restore) {
            process.env.restore()
        }
    })

    async function mqttPubAndAwait (topic, payload, responseTopic) {
        return _mqttPubAndAwait(mqtt, topic, payload, responseTopic)
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
        // console.log('commandTopic', commandTopic)
        // console.log('responseTopic', responseTopic)
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
        await new Promise(resolve => setTimeout(resolve, 50))
        response.should.have.a.property('command', 'startEditor')
        response.should.have.a.property('correlationData', 'correlationData-test')
        response.should.have.a.property('payload').and.be.an.Object()
        response.payload.should.have.a.property('connected', false)
        response.payload.should.have.a.property('token', 'token-test')
    })
    it('Calls save token when commanded to startEditor', async function () {
        mqttClient.start()
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        // console.log('commandTopic', commandTopic)
        // console.log('responseTopic', responseTopic)
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)

        mqttClient.agent.launcher = {} // fake a launcher so that `startTunnel` gets to the point where it saves the token

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
        await new Promise(resolve => setTimeout(resolve, 50))
        response.should.have.a.property('command', 'startEditor')
        mqttClient.agent.saveEditorToken.callCount.should.equal(1)
        mqttClient.agent.saveEditorToken.firstCall.calledWith('token-test').should.be.true()
    })
    it('does not crash when agent.setState() throws', function (done) {
        // spy on warn()
        // unstub the hushed console.log
        console.log.restore()
        sinon.spy(console, 'log')
        // mute multiple calls to done() because if we do have an unhandledRejection,
        // we probably had, or will have a timeout and a done() call too
        const doneOnce = function (err) {
            if (doneOnce.called) { return }
            doneOnce.called = true
            done(err)
        }
        // global unhandled exception handler to catch the error thrown by setState()
        process.on('unhandledRejection', (reason) => {
            doneOnce(new Error('unhandledRejection caught'))
        })

        mqttClient.start()
        if (mqttClient.agent.setState.isSinonProxy) {
            mqttClient.agent.setState = null
            mqttClient.agent.setState = async function (state) {
                // sleep for 10 ms, simulating a nested async call
                await new Promise(resolve => setTimeout(resolve, 10))
                throw new Error('setState() threw')
            }
            // spy on the agent.setState() method
            sinon.spy(mqttClient.agent, 'setState')
        }

        // short delay to allow mqtt to connect and stack to unwind
        setTimeout(() => {
            // send an update command that will cause the agent to call setState
            const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
            const payload = {
                command: 'update',
                debugInfo: 'From MQTT test @ ' + new Date().toISOString()
            }
            mqttPubAndAwait(commandTopic, JSON.stringify(payload), null).then(() => {
                // short delay to allow mqtt command to be sent, received and processed
                setTimeout(() => {
                    if (mqttClient.agent.setState.calledOnce) {
                        // find the console.log call made by the agent.setState() error handler
                        const consoleLogCalls = console.log.getCalls()
                        const consoleLogCall = consoleLogCalls.find(call => call.args[0].includes('Error: setState() threw'))
                        doneOnce(consoleLogCall ? null : new Error('error not thrown'))
                    } else {
                        doneOnce(new Error('agent.setState() not called'))
                    }
                }, 300)
            }).catch(doneOnce)
        }, 400)
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
    it.skip('MQTT command startResource starts resource', async function () {
        // TODO
    })
    it.skip('MQTT command stopResources stops resource', async function () {
        // TODO
    })
    it.skip('MQTT command upload gets a response with a snapshot', async function () {
        // TODO
    })
    it('MQTT command requestPackages', async function () {
        mqttClient.start()
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const payload = {
            command: 'reportPackages'
        }

        const payloadStr = JSON.stringify(payload)
        await new Promise(resolve => setTimeout(resolve, 500))
        mqttClient.client.publish(commandTopic, payloadStr, function (err) {
            if (err) {
                console.debug(err)
                should.fail()
            }
        })
        await new Promise(resolve => setTimeout(resolve, 500))

        mqttClient.should.have.property('reportPackages', true)
    })
    it('suspend action calls agent.suspendNR and checks in', async function () {
        mqttClient.start()
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)

        const payload = {
            command: 'action',
            correlationData: 'correlationData-test',
            responseTopic,
            payload: {
                action: 'suspend'
            }
        }
        const payloadStr = JSON.stringify(payload)

        // short delay to allow mqtt to connect and stack to unwind
        await new Promise(resolve => setTimeout(resolve, 500))
        const response = await mqttPubAndAwait(commandTopic, payloadStr, responseTopic)
        await new Promise(resolve => setTimeout(resolve, 50))
        response.should.have.a.property('command', 'action')
        response.should.have.a.property('correlationData', 'correlationData-test')
        response.should.have.a.property('payload').and.be.an.Object()
        response.payload.should.have.a.property('success', true)
        mqttClient.agent.suspendNR.callCount.should.equal(1)
        mqttClient.agent.checkIn.callCount.should.equal(1)
    })
    it('start action calls agent.startNR and checks in', async function () {
        mqttClient.start()
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)

        const payload = {
            command: 'action',
            correlationData: 'correlationData-test',
            responseTopic,
            payload: {
                action: 'start'
            }
        }
        const payloadStr = JSON.stringify(payload)

        // short delay to allow mqtt to connect and stack to unwind
        await new Promise(resolve => setTimeout(resolve, 500))
        const response = await mqttPubAndAwait(commandTopic, payloadStr, responseTopic)
        await new Promise(resolve => setTimeout(resolve, 50))
        response.should.have.a.property('command', 'action')
        response.should.have.a.property('correlationData', 'correlationData-test')
        response.should.have.a.property('payload').and.be.an.Object()
        response.payload.should.have.a.property('success', true)
        mqttClient.agent.startNR.callCount.should.equal(1)
        mqttClient.agent.checkIn.callCount.should.equal(1)
    })
    it('restart action calls agent.restartNR and checks in', async function () {
        mqttClient.start()
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
        mqttClient.should.have.a.property('client').and.be.an.Object()
        mqttClient.should.have.a.property('commandTopic').and.be.a.String().and.equal(commandTopic)
        mqttClient.should.have.a.property('responseTopic').and.be.a.String().and.equal(responseTopic)

        const payload = {
            command: 'action',
            correlationData: 'correlationData-test',
            responseTopic,
            payload: {
                action: 'restart'
            }
        }
        const payloadStr = JSON.stringify(payload)

        // short delay to allow mqtt to connect and stack to unwind
        await new Promise(resolve => setTimeout(resolve, 500))
        const response = await mqttPubAndAwait(commandTopic, payloadStr, responseTopic)
        await new Promise(resolve => setTimeout(resolve, 50))
        response.should.have.a.property('command', 'action')
        response.should.have.a.property('correlationData', 'correlationData-test')
        response.should.have.a.property('payload').and.be.an.Object()
        response.payload.should.have.a.property('success', true)
        mqttClient.agent.restartNR.callCount.should.equal(1)
        mqttClient.agent.checkIn.callCount.should.equal(1)
    })
    it('Invalid action responds with error', async function () {
        mqttClient.start()
        sinon.spy(mqttClient, 'sendCommandResponse')
        const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
        const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`

        const payload = {
            command: 'action',
            correlationData: 'correlationData-test',
            responseTopic,
            payload: {
                action: 'bad-action'
            }
        }
        const payloadStr = JSON.stringify(payload)

        // short delay to allow mqtt to connect and stack to unwind
        await new Promise(resolve => setTimeout(resolve, 500))
        await mqttPubAndAwait(commandTopic, payloadStr, responseTopic)
        await new Promise(resolve => setTimeout(resolve, 50))

        // check that an error response was sent
        mqttClient.sendCommandResponse.callCount.should.equal(1)
        mqttClient.sendCommandResponse.firstCall.args.should.have.length(2)
        const req = mqttClient.sendCommandResponse.firstCall.args[0]
        should(req).be.an.Object()
        req.should.have.a.property('command', 'action')
        const res = mqttClient.sendCommandResponse.firstCall.args[1]
        should(res).be.an.Object()
        res.should.have.a.property('success', false)
        res.should.have.a.property('error').and.be.an.Object()
        res.error.should.have.a.property('code', 'unsupported_action')
    })

    describe('Proxy Support', function () {
        // common variables
        const port2 = port + 1 // MQTT broker port
        /** @type {import('aedes-server-factory').Server} MQTT WS */ let httpServerProxied
        /** @type {Aedes} MQTT Broker */ let aedesProxied = null
        /** @type {MQTT.MqttClient} MQTT Client */ let mqttProxied

        before(async function () {
            aedesProxied = new Aedes()
            httpServerProxied = createProxy(createServer(aedesProxied, { ws: true }))
            httpServerProxied.localAddress = '127.0.0.99' // REF: https://gist.github.com/ttodua/7a66e5ca28e55deebc58b0dd8e0c39a2
            httpServerProxied.listen(proxyPort, proxyHost, function () {
                // console.log('websocket server listening on port ', port2)
            })
            let nextSocketId = 0
            httpServerProxied.on('connection', function (socket) {
                // Add a newly connected socket
                const socketId = nextSocketId++
                sockets[socketId] = socket
                // console.log('socket', socketId, 'opened')

                // Remove the socket when it closes
                socket.on('close', function () {
                    // console.log('socket', socketId, 'closed')
                    delete sockets[socketId]
                })
            })
            const agent = new HttpProxyAgent('http://' + proxyHost + ':' + proxyPort)

            mqttProxied = MQTT.connect(`ws://localhost:${port2}`, {
                wsOptions: {
                    agent
                },
                clientId: 'testsuite-' + Date.now(),
                username: 'device:team:device',
                password: 'pass',
                protocol: 'ws'
            })
        })

        after(async function () {
            mqttProxied && mqttProxied.end()
            aedesProxied.close()
            aedesProxied.removeAllListeners()
            if (httpServerProxied) {
                // Close the server
                httpServerProxied.close(function () { /* console.log('Server closed!') */ })
                // Destroy all open sockets
                for (const socketId in sockets) {
                    // console.log('socket', socketId, 'destroyed')
                    sockets[socketId].destroy()
                }
            }
            sinon.restore()
        })

        afterEach(async function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            delete process.env.all_proxy
        })

        async function mqttPubAndAwait (topic, payload, responseTopic) {
            return _mqttPubAndAwait(mqttProxied, topic, payload, responseTopic)
        }

        it('MQTT Comms Client does not set a proxy agent if process env does not contain proxy settings', async function () {
            process.env.http_proxy = ''
            process.env.https_proxy = ''

            // initialise the mqtt client
            mqttClient.start()

            // the client and agent should have been created without proxy agent settings
            mqttClient.should.have.a.property('client').and.be.an.Object()
            mqttClient.client.options.hostname.should.equal('localhost')
            mqttClient.client.options.port.should.equal('' + port)

            mqttClient.brokerConfig.should.not.have.a.property('wsOptions')
            mqttClient.client.options.wsOptions.should.not.have.a.property('agent')
        })

        it('MQTT Comms Client has a HttpProxyAgent for ws connection', async function () {
            process.env.http_proxy = `http://${proxyHost}:${proxyPort}`
            process.env.https_proxy = `http://${proxyHost}:${proxyPort}`

            // initialise the mqtt client
            mqttClient.config.brokerURL = 'ws://localhost:' + port
            mqttClient.start()

            // the client and agent should have been created without proxy agent settings
            mqttClient.should.have.a.property('client').and.be.an.Object()
            mqttClient.client.options.hostname.should.equal('localhost')
            mqttClient.client.options.port.should.equal('' + port)

            mqttClient.brokerConfig.should.have.a.property('wsOptions')
            mqttClient.brokerConfig.wsOptions.should.have.a.property('agent').and.be.an.Object()
            should(mqttClient.brokerConfig.wsOptions.agent instanceof HttpProxyAgent).be.true()
        })

        it('MQTT Comms Client has a HttpsProxyAgent for wss connection', async function () {
            process.env.http_proxy = `http://${proxyHost}:${proxyPort}`
            process.env.https_proxy = `http://${proxyHost}:${proxyPort}`

            // initialise the mqtt client
            mqttClient.config.brokerURL = 'wss://localhost:' + port
            mqttClient.start()

            // the client and agent should have been created without proxy agent settings
            mqttClient.should.have.a.property('client').and.be.an.Object()
            mqttClient.client.options.hostname.should.equal('localhost')
            mqttClient.client.options.port.should.equal('' + port)

            mqttClient.brokerConfig.should.have.a.property('wsOptions')
            mqttClient.brokerConfig.wsOptions.should.have.a.property('agent').and.be.an.Object()
            should(mqttClient.brokerConfig.wsOptions.agent instanceof HttpsProxyAgent).be.true()
        })

        it('MQTT Comms Client can connect with proxy', async function () {
            process.env.http_proxy = `http://${proxyHost}:${proxyPort}`
            process.env.https_proxy = `http://${proxyHost}:${proxyPort}`

            // start and send test message
            mqttClient.start()

            // the client and agent should have been created with the correct settings
            mqttClient.should.have.a.property('client').and.be.an.Object()
            mqttClient.client.options.hostname.should.equal('localhost')
            mqttClient.client.options.port.should.equal('' + port)

            mqttClient.brokerConfig.should.have.a.property('wsOptions').and.be.an.Object()
            mqttClient.brokerConfig.wsOptions.should.have.a.property('agent').and.be.an.Object()
            mqttClient.client.options.should.have.a.property('wsOptions').and.be.an.Object()
            mqttClient.client.options.wsOptions.should.have.a.property('agent').and.be.an.Object()
            mqttClient.client.options.wsOptions.agent.proxy.hostname.should.equal(proxyHost)
            mqttClient.client.options.wsOptions.agent.proxy.port.should.equal('' + proxyPort)

            // a short async delay to permit mqtt to connect
            await new Promise(resolve => setTimeout(resolve, 500))

            mqttClient.client.connected.should.be.true()
        })

        it('MQTT command gets a response when proxy is set', async function () {
            process.env.http_proxy = `http://${proxyHost}:${proxyPort}`
            process.env.https_proxy = `http://${proxyHost}:${proxyPort}`

            mqttClient.start()

            const commandTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/command`
            const responseTopic = `ff/v1/${mqttClient.teamId}/d/${mqttClient.deviceId}/response`
            // console.log('commandTopic', commandTopic)
            // console.log('responseTopic', responseTopic)
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
            await new Promise(resolve => setTimeout(resolve, 50))
            response.should.have.a.property('command', 'startEditor')
            response.should.have.a.property('correlationData', 'correlationData-test')
            response.should.have.a.property('payload').and.be.an.Object()
            response.payload.should.have.a.property('connected', false)
            response.payload.should.have.a.property('token', 'token-test')
        })
    })
})
