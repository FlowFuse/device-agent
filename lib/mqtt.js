const mqtt = require('mqtt')
const { info, warn, debug } = require('./log')

class MQTTClient {
    constructor (agent, config) {
        this.agent = agent
        this.config = config

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

        const period = this.config.interval || 60
        info(`Starting heartbeat thread. Interval: ${period}s`)
        this.interval = setInterval(() => {
            this.checkIn()
        }, period * 1000)
    }

    stop () {
        if (this.interval) {
            info('Stopping heartbeat thread')
            clearInterval(this.interval)
            this.interval = undefined
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
