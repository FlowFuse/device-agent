const mqtt = require('mqtt')
const { info, warn, debug, setMQTT, getBufferedMessages } = require('./logging/log')
const { IntervalJitter } = require('./IntervalJitter')
const url = require('url')
const EditorTunnel = require('./editor/tunnel')

class MQTTClient {
    /**
     * MQTT Client for the FlowForge API
     * @param {import('./agent').Agent} agent
     * @param {Object} config
     */
    constructor (agent, config) {
        /** @type {import('./agent').Agent} */
        this.agent = agent
        this.config = config
        /** @type {IntervalJitter} */
        this.heartbeat = new IntervalJitter()
        /** @type {EditorTunnel} */
        this.tunnel = null

        this.sentInitialCheckin = false
        this.initialCheckinTimeout = null

        const parts = /^device:(.*):(.*)$/.exec(config.brokerUsername)
        if (!parts) {
            throw new Error('Invalid brokerUsername')
        }
        this.teamId = parts[1]
        this.deviceId = parts[2]
        this.activeProject = null

        this.commandTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/command`
        this.statusTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/status`
        this.logTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/logs`
        this.responseTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/response`

        /** @type {mqtt.IClientOptions} */
        this.brokerConfig = {
            clientId: config.brokerUsername,
            username: config.brokerUsername,
            password: config.brokerPassword,
            reconnectPeriod: 15000,
            queueQoSZero: false
        }
        setMQTT(this)
    }

    start () {
        // PROBLEM: ipv6 ws addresses cannot connect
        // INFO: Calling mqtt.connect('http://[::1]:8883') fails with error  ERR_INVALID_URL
        // INFO: Calling mqtt.connect(new URL('http://[::1]:8883')) fails because `connect` only accepts a `string` or `url.parse` object
        // INFO: Calling mqtt.connect(url.parse('http://[::1]:8883') fails because unlike new URL, url.parse drops the square brackets off hostname
        //       (mqtt.js disassembles and reassembles the url using hostname + port so `ws://[::1]:8883` becomes `ws://::1:8883`)
        // INFO: WS src code uses `new URL` so when `mqtt.js` passes the reassembled IP `http://::1:8883`, it fails with error ERR_INVALID_URL
        // SEE: https://github.com/mqttjs/MQTT.js/issues/1569
        // eslint-disable-next-line n/no-deprecated-api
        const brokerURL = url.parse(this.config.brokerURL)
        const _url = new URL(this.config.brokerURL)
        brokerURL.hostname = _url.hostname
        this.client = mqtt.connect(brokerURL, this.brokerConfig)

        this.client.on('connect', () => {
            this.client.publish(this.statusTopic, JSON.stringify(this.agent.getState()))
        })
        this.client.on('close', () => { })
        this.client.on('reconnect', () => {
            info('MQTT reconnecting to platform')
        })
        this.client.on('error', (err) => {
            warn(`MQTT connection error: ${err.toString()}`)
        })

        this.client.on('message', async (topic, message, packet) => {
            debug(`Command from ${topic}`)
            const _message = message.toString()
            try {
                const msg = JSON.parse(_message)
                if (msg.command === 'update') {
                    if (this.initialCheckinTimeout) {
                        clearTimeout(this.initialCheckinTimeout)
                        this.initialCheckinTimeout = null
                        this.sentInitialCheckin = true
                    }
                    this.agent.setState(msg)
                    return
                } else if (msg.command === 'startLog') {
                    if (!this.logEnabled) {
                        this.client.publish(this.logTopic, JSON.stringify(getBufferedMessages()))
                    }
                    this.logEnabled = true
                    return
                } else if (msg.command === 'stopLog') {
                    this.logEnabled = false
                    return
                } else if (msg.command === 'startEditor') {
                    info('Enabling remote editor access')
                    if (this.tunnel) {
                        this.tunnel.close()
                        this.tunnel = null
                    }
                    // * Enable Device Editor (Step 6) - (forge:MQTT->device) Create the tunnel on the device
                    this.tunnel = EditorTunnel.create(this.config, { token: msg?.payload?.token })
                    // * Enable Device Editor (Step 7) - (device) Begin the device tunnel connect process
                    const result = await this.tunnel.connect()
                    // * Enable Device Editor (Step 10) - (device->forge:MQTT) Send a response to the platform
                    this.sendCommandResponse(msg, { connected: result, token: msg?.payload?.token })
                    this.sendStatus()
                    return
                } else if (msg.command === 'stopEditor') {
                    info('Disabling remote editor access')
                    if (this.tunnel) {
                        this.tunnel.close()
                        this.tunnel = null
                    }
                    return
                } else if (msg.command === 'upload') {
                    info('Capturing device snapshot')
                    // upload expects a response. get the data and send it back
                    const response = await this.getUploadData()
                    this.sendCommandResponse(msg, response)
                    return
                }
                warn(`Invalid command type received from platform: ${msg.command}`)
            } catch (err) {
                warn(err)
                warn(`Invalid command message received from platform: ${_message}`)
            }
        })
        debug(`MQTT subscribe ${this.commandTopic}`)
        this.client.subscribe([this.commandTopic])

        const period = Math.ceil(this.config.interval || 60)
        const jitter = Math.ceil(this.config.intervalJitter || 10)
        info(`Starting MQTT heartbeat thread. Interval: ${period}s (±${jitter / 2}s)`)
        // initial heartbeat to be operated at 255ms (±250ms)
        this.heartbeat.start({ interval: period * 1000, jitter: jitter * 1000, firstInterval: 10, firstJitter: 500 }, () => {
            this.checkIn()
        })
    }

    stop () {
        if (this.heartbeat.isRunning) {
            info('Stopping MQTT heartbeat thread')
            this.heartbeat.stop()
        }
        info('Closing MQTT connection')
        setMQTT(undefined)
        this.client && this.client.end()
    }

    checkIn () {
        const payload = this.agent.getState()
        if (!payload) {
            // No payload means we're busy updating - don't call home
            return
        }
        if (!this.sentInitialCheckin) {
            this.initialCheckinTimeout = setTimeout(() => {
                warn('Timeout performing initial check-in')
                // Timeout the initial checkin - tell the agent to
                // carry on with what it has already got
                this.agent.setState(payload)
                this.initialCheckinTimeout = null
            }, 10000)
            this.sentInitialCheckin = true
        }
        debug('Sending check-in message')
        this.client.publish(this.statusTopic, JSON.stringify(payload))
    }

    sendStatus () {
        const payload = this.agent.getState()
        if (!payload) {
            return
        }
        debug('Sending status message')
        this.client.publish(this.statusTopic, JSON.stringify(payload))
    }

    async getUploadData (options) {
        options = options || {}
        const uploadFlows = typeof options.uploadFlows === 'boolean' ? options.uploadFlows : true // default to true
        const uploadCredentials = typeof options.uploadCredentials === 'boolean' ? options.uploadCredentials : true // default to true
        const uploadPackage = typeof options.uploadPackage === 'boolean' ? options.uploadPackage : true // default to true
        const data = {}
        data.state = this.agent.getState()
        if (uploadFlows) {
            // data.flows = [{ id: 'test', type: 'tab', label: 'Flow 1', disabled: false, info: '' }]
            data.flows = await this.agent.getCurrentFlows()
        }
        if (uploadCredentials) {
            data.credentials = await this.agent.getCurrentCredentials()
        }
        if (uploadPackage) {
            data.package = await this.agent.getCurrentPackage()
        }
        return data
    }

    setProject (project) {
        if (project !== this.activeProject) {
            if (this.activeProject) {
                const projectTopic = `ff/v1/${this.teamId}/p/${this.activeProject}/command`
                debug(`MQTT unsubscribe ${projectTopic}`)
                this.client.unsubscribe(projectTopic)
            }
            this.activeProject = project
            if (this.activeProject) {
                const projectTopic = `ff/v1/${this.teamId}/p/${this.activeProject}/command`
                debug(`MQTT subscribe ${projectTopic}`)
                this.client.subscribe(projectTopic)
            }
        }
    }

    log (logMessage) {
        if (this.logEnabled) {
            this.client.publish(this.logTopic, JSON.stringify(logMessage))
        }
    }

    /**
     * Sends a well formed command/response message in response to a command request
     * @param {*} request The command to respond to
     * @param {*} response The payload to send back to the platform
     */
    sendCommandResponse (request, response) {
        const correlationData = request?.correlationData
        const responseTopic = request?.responseTopic || this.responseTopic
        const command = request?.command

        if (!correlationData || !responseTopic || !command) {
            warn('Invalid command response, cannot send response to forge platform')
            return
        }
        const message = {
            teamId: this.teamId, // for message routing and verification
            deviceId: this.deviceId, // for message routing and verification
            command, // for command response verification
            correlationData, // for correlating response with request
            payload: response // the actual response payload
        }
        const messageJSON = JSON.stringify(message)
        this.client.publish(responseTopic, messageJSON, (err) => {
            if (err) {
                warn(`Error sending response to command ${command}: ${err}`)
            }
        })
    }
}

module.exports = {
    newMQTTClient: (agent, config) => new MQTTClient(agent, config),
    MQTTClient
}
