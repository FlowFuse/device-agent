const mqtt = require('mqtt')
const { info, warn, debug } = require('./log')
const { IntervalJitter } = require('./IntervalJitter')

class MQTTClient {
    constructor (agent, config) {
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
        this.client = mqtt.connect(this.config.brokerURL, this.brokerConfig)
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
        info(`Starting heartbeat thread. Interval: ${period}s (±${jitter / 2}s)`)
        // initial heartbeat to be operated at 255ms (±250ms)
        this.heartbeat.start({ interval: period * 1000, jitter: jitter * 1000, firstInterval: 10, firstJitter: 500 }, () => {
            this.checkIn()
        })
    }

    stop () {
        if (this.heartbeat.isRunning) {
            info('Stopping heartbeat thread')
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
    MQTTClient: (agent, config) => new MQTTClient(agent, config)
}
