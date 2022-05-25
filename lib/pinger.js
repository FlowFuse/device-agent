const got = require('got')
const { Launcher } = require('./launcher.js')

/*
 * Sends regular heartbeat to Forge instance and then
 * downloads any changes to the Project Snapshot
 */

class Pinger {
    constructor (config) {
        this.config = config
        this.client = got.extend({
            prefixUrl: `${this.config.forgeURL}/api/v1/devices/${this.config.deviceId}/`,
            headers: {
                'user-agent': `FlowForge Device Agent v${this.config.deviceAgentVersion}`,
                authorization: `Bearer ${this.config.token}`
            },
            timeout: {
                request: 1000
            }
        })
        this.checkIn()
        this.startChecking()
    }

    stop () {
        this.stopChecking()
        if (this.laucher) {
            this.laucher.stop()
        }
    }

    startChecking () {
        console.log('starting ping thread')
        this.interval = setInterval(() => {
            this.checkIn()
        }, (this.config.period * 1000))
    }

    stopChecking () {
        clearInterval(this.interval)
        this.interval = undefined
    }

    async checkIn () {
        console.log(`checkIn ${this.currentSnapshot}`)
        const state = this
        const payload = {
            snapshot: state.currentSnapshot ? state.currentSnapshot : ''
        }
        this.client.post('live/state', {
            json: payload
        }).then(body => {
            // all good
            // console.log(body)
        }).catch(async err => {
            console.log('none 200', err.response.statusCode)
            if (err.response.statusCode === 409) {
                console.log('need new snapshot')
                const snapshot = await this.getLatestSnapshot()
                console.log(state.currentSnapshot, snapshot.id)
                state.currentSnapshot = snapshot.id
                if (state.launcher) {
                    state.launcher.stop()
                }
                state.launcher = new Launcher(this.config, snapshot)
                await state.launcher.writeNodes()
                await state.launcher.writeFlow()
                await state.launcher.writeCredentials()
                await state.launcher.writeSettings()
                await state.launcher.start()
            } else if (err.response.statusCode === 401) {
                console.log('Authentication problem')
            }
        })
    }

    async getLatestSnapshot () {
        try {
            const snapshot = await this.client.get('live/snapshot').json()
            console.log('downloaded new snapshot')
            return snapshot
        } catch (err) {
            console.log('Problem getting snapshot')
            console.log(err)
        }
    }
}

module.exports = { Pinger }
