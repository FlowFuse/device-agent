const { default: got } = require('got')
const { info, warn, debug } = require('./logging/log')
const { IntervalJitter } = require('./IntervalJitter')
const { getHTTPProxyAgent } = require('./utils')

class HTTPClient {
    /**
     * HTTP Client for the FlowFuse API
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
                'user-agent': `FlowFuse Device Agent v${this.config.version}`,
                authorization: `Bearer ${this.config.token}`
            },
            timeout: {
                request: 10000
            },
            agent: getHTTPProxyAgent(this.config.forgeURL, { timeout: 10000 })
        })
    }

    /**
     * Calls home to the platform API to retrieve the assigned snapshot
     * NOTE: Errors will be thrown (wrap in try/catch)
     * @returns {Object} The snapshot
     */
    async getSnapshot () {
        return await this.client.get('live/snapshot', { timeout: { request: 30000 } }).json()
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

    isPolling () {
        return this.heartbeat.isRunning
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
                this.agent.setState(null).catch((err) => {
                    debug(`Error shutting down: ${err.toString()}`)
                })
            }
            return
        }
        if (!this.completedInitialCheckin) {
            info('Connecting to FlowFuse platform to verify device state')
        }
        // If we're not in provisioning mode, post the state to the server
        debug('Calling home')
        debug(JSON.stringify(payload, null, 2))
        this.client.post('live/state', {
            json: payload
        }).then(async body => {
            debug('No updated needed')
            // We still notify the agent so it can decide what to do
            await this.agent.setState({
                application: payload.application,
                ownerType: payload.ownerType || payload.application ? 'application' : (payload.project ? 'project' : null),
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
                        application: response.application,
                        ownerType: response.ownerType || response.application ? 'application' : (response.project ? 'project' : null),
                        project: response.project,
                        snapshot: response.snapshot,
                        settings: response.settings
                    }).catch(() => {
                        debug(`Error setting agent state: ${err.toString()}`)
                    })
                } else if (err.response.statusCode === 404) {
                    warn('Unknown device. Shutting down')
                    this.agent.setState(null).catch((err) => {
                        debug(`Error shutting down: ${err.toString()}`)
                    })
                } else if (err.response.statusCode === 401) {
                    warn('Invalid device credentials. Shutting down')
                    this.agent.setState(null).catch((err) => {
                        debug(`Error shutting down: ${err.toString()}`)
                    })
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
                    console.error(err)
                }
                if (!this.completedInitialCheckin) {
                    // Allow the agent to start the existing project (if any)
                    // having failed to do the initial checkin.
                    this.completedInitialCheckin = true
                    this.agent.setState({
                        application: payload.application,
                        ownerType: payload.ownerType || payload.application ? 'application' : (payload.project ? 'project' : null),
                        project: payload.project,
                        snapshot: payload.snapshot,
                        settings: payload.settings
                    }).catch(err => {
                        warn(`Error starting existing project: ${err.toString()}`)
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
