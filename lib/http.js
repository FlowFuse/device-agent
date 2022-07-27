const got = require('got')
const { info, warn, debug } = require('./log')

class HTTPClient {
    constructor (agent, config) {
        this.agent = agent
        this.config = config
        this.client = got.extend({
            prefixUrl: `${this.config.forgeURL}/api/v1/devices/${this.config.deviceId}/`,
            headers: {
                'user-agent': `FlowForge Device Agent v${this.config.version}`,
                authorization: `Bearer ${this.config.token}`
            },
            timeout: {
                request: 10000
            }
        })
    }

    async getSnapshot () {
        try {
            return await this.client.get('live/snapshot').json()
        } catch (err) {
            warn(`Problem getting snapshot: ${err.toString()}`)
            debug(err)
        }
    }

    async getSettings () {
        try {
            return await this.client.get('live/settings').json()
        } catch (err) {
            warn(`Problem getting snapshot: ${err.toString()}`)
            debug(err)
        }
    }

    async startPolling () {
        const period = this.config.interval || 60
        info(`Starting http poll thread. Interval: ${period}s`)
        this.interval = setInterval(() => {
            this.checkIn()
        }, period * 1000)
        this.checkIn()
    }

    async stopPolling () {
        if (this.interval) {
            info('Stopping http poll thread')
            clearInterval(this.interval)
            this.interval = undefined
        }
    }

    async checkIn () {
        const payload = this.agent.getState()
        if (!payload) {
            // No payload means we're busy updating - don't call home
            return
        }
        debug('Calling home')
        debug(JSON.stringify(payload, null, 2))
        this.downloading = true
        this.client.post('live/state', {
            json: payload
        }).then(async body => {
            debug('No updated needed')
            // We still notify the agent so it can decide what to do
            this.agent.setState({
                project: payload.project,
                snapshot: payload.snapshot,
                settings: payload.settings
            })
        }).catch(async err => {
            if (err.response) {
                if (err.response.statusCode === 409) {
                    const response = JSON.parse(err.response.body)
                    this.agent.setState({
                        project: response.project,
                        snapshot: response.snapshot,
                        settings: response.settings
                    })
                } else if (err.response.statusCode === 404) {
                    warn('Unknown device. Shutting down')
                    this.agent.setState(null)
                } else if (err.response.statusCode === 401) {
                    warn('Invalid device credentials. Shutting down')
                    this.agent.setState(null)
                } else {
                    warn(`Unexpected call home error: ${err.toString()}`)
                }
            } else {
                if (err.code === 'ECONNREFUSED') {
                    warn(`Unable to connect to ${this.config.forgeURL}`)
                } else if (err.code === 'ETIMEDOUT') {
                    warn(`Timeout trying to connect to ${this.config.forgeURL}`)
                } else {
                    console.log(err)
                    warn(`Error whilst starting project: ${err.toString()}`)
                }
            }
        })
    }
}

module.exports = {
    HTTPClient: (agent, config) => new HTTPClient(agent, config)
}
