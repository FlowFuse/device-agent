const mqtt = require('mqtt')
const { info, warn, debug } = require('./log')
const { IntervalJitter } = require('./IntervalJitter')
const url = require('url')

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

        const parts = /^device:(.*):(.*)$/.exec(config.brokerUsername)
        if (!parts) {
            throw new Error('Invalid brokerUsername')
        }
        this.teamId = parts[1]
        this.deviceId = parts[2]
        this.activeProject = null

        this.commandTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/command`
        this.statusTopic = `ff/v1/${this.teamId}/d/${this.deviceId}/status`

        this.brokerConfig = {
            clientId: config.brokerUsername,
            username: config.brokerUsername,
            password: config.brokerPassword,
            reconnectPeriod: 15000,
            queueQoSZero: false
        }
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

        this.client.on('message', (topic, message) => {
            debug(`Command from ${topic}`)
            const payload = message.toString()
            try {
                const command = JSON.parse(payload)
                if (command.command === 'update') {
                    this.agent.setState(command)
                    return
                }
                warn(`Invalid command type received from platform: ${command}`)
            } catch (err) {
                warn(`Invalid command payload received from platform: ${payload}`)
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
        this.client.end()
    }

    checkIn () {
        const payload = this.agent.getState()
        if (!payload) {
            // No payload means we're busy updating - don't call home
            return
        }
        debug('Sending check-in message')
        this.client.publish(this.statusTopic, JSON.stringify(payload))
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
}

module.exports = {
    newMQTTClient: (agent, config) => new MQTTClient(agent, config),
    MQTTClient
}
