const got = require('got').default
const { info, warn, debug } = require('./logging/log')
const { IntervalJitter } = require('./IntervalJitter')

class HTTPClient {
    /**
     * HTTP Client for the FlowForge API
     * @param {import('./agent').Agent} agent
     * @param {Object} config
     */
    constructor (agent, config) {
        /** @type {import('./agent').Agent} */
        this.agent = agent
        this.config = config
        /** @type {IntervalJitter} */
        this.heartbeat = new IntervalJitter()

        this.completedInitialCheckin = false

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
            warn(`Problem getting settings: ${err.toString()}`)
            debug(err)
        }
    }

    async startPolling () {
        const period = Math.ceil(this.config.interval || 60)
        const jitter = Math.ceil(this.config.intervalJitter || 10)
        info(`Starting HTTP poll thread. Interval: ${period}s (±${jitter / 2}s)`)
        // initial heartbeat to be operated between 0 ~ 500ms
        this.heartbeat.start({ interval: period * 1000, jitter: jitter * 1000, firstInterval: 0, firstJitter: 500 }, () => {
            this.checkIn()
        })
    }

    async stopPolling () {
        if (this.heartbeat.isRunning) {
            info('Stopping HTTP poll thread')
            this.heartbeat.stop()
        }
    }

    async checkIn () {
        const payload = this.agent.getState()
        if (!payload) {
            // No payload means we're busy updating - don't call home
            return
        }

        // If we're in provisioning mode, try to provision the device
        if (this.config.provisioningMode) {
            try {
                await this.agent.AgentManager.provisionDevice()
            } catch (error) {
                debug(error)
                warn('Provisioning Error. Shutting down')
                this.agent.setState(null)
            }
            return
        }
        if (!this.completedInitialCheckin) {
            info('Connecting to FlowForge platform to verify device state')
        }
        // If we're not in provisioning mode, post the state to the server
        debug('Calling home')
        debug(JSON.stringify(payload, null, 2))
        this.client.post('live/state', {
            json: payload
        }).then(async body => {
            debug('No updated needed')
            // We still notify the agent so it can decide what to do
            this.agent.setState({
                project: payload.project,
                snapshot: payload.snapshot,
                settings: payload.settings,
                mode: payload.mode,
                licensed: payload.licensed
            })
        }).catch(async err => {
            if (err.response) {
                this.completedInitialCheckin = true
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
                    warn(`Unable to connect to ${this.config.forgeURL}: connection refused`)
                } else if (err.code === 'ETIMEDOUT') {
                    warn(`Timeout trying to connect to ${this.config.forgeURL}`)
                } else if (err.code === 'EHOSTUNREACH') {
                    warn(`Unable to connect to ${this.config.forgeURL}: network unreachable`)
                } else {
                    warn(`Error whilst starting Node-RED: ${err.toString()}`)
                    console.log(err)
                }
                if (!this.completedInitialCheckin) {
                    // Allow the agent to start the existing project (if any)
                    // having failed to do the initial checkin.
                    this.completedInitialCheckin = true
                    this.agent.setState({
                        project: payload.project,
                        snapshot: payload.snapshot,
                        settings: payload.settings
                    })
                }
            }
        })
    }
}

module.exports = {
    newHTTPClient: (agent, config) => new HTTPClient(agent, config),
    HTTPClient
}
