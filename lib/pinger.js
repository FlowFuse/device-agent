const fs = require('fs')
const got = require('got')
const path = require('path')
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

        const projectFilePath = path.join(this.config.userDir, 'flowforge.project')
        if (fs.existsSync(projectFilePath)) {
            try {
                const snapshot = JSON.parse(fs.readFileSync(projectFilePath))
                if (snapshot.id) {
                    this.currentSnapshot = snapshot
                }
            } catch (err) {
                // empty or broken project file
            }
        }

        this.checkIn()
        this.startChecking()
    }

    stop () {
        this.stopChecking()
        if (this.launcher) {
            this.launcher.stop()
        }
    }

    startChecking () {
        console.log('starting ping thread')
        const period = this.config.period ? (this.config.period * 1000) : 60000
        this.interval = setInterval(() => {
            this.checkIn()
        }, period)
    }

    stopChecking () {
        clearInterval(this.interval)
        this.interval = undefined
    }

    async checkIn () {
        console.log(`checkIn ${this.currentSnapshot?.id}`)
        const state = this
        const payload = {
            snapshot: state.currentSnapshot ? state.currentSnapshot.id : ''
        }
        this.client.post('live/state', {
            json: payload
        }).then(body => {
            // all good
            if (!state.launcher) {
                state.launcher = new Launcher(state.config, state.currentSnapshot)
                state.launcher.start()
            }
        }).catch(async err => {
            if (err.response) {
                console.log('none 200', err.response.statusCode)
                if (err.response.statusCode === 409) {
                    console.log('need new snapshot')
                    const snapshot = await this.getLatestSnapshot()
                    if (snapshot.id) {
                        console.log(state.currentSnapshot, snapshot.id)
                        state.currentSnapshot = snapshot.id
                        const projectFilePath = path.join(this.config.userDir, 'flowforge.project')
                        fs.writeFileSync(projectFilePath, JSON.stringify(snapshot))
                        if (state.launcher) {
                            state.launcher.stop()
                            state.launcher = undefined
                        }
                        state.launcher = new Launcher(this.config, snapshot)
                        await state.launcher.writeNodes()
                        await state.launcher.writeFlow()
                        await state.launcher.writeCredentials()
                        await state.launcher.writeSettings()
                        await state.launcher.start()
                    } else {
                        console.log('Empty snapshot, should stop')
                        if (state.launcher) {
                            state.launcher.stop()
                        }
                    }
                } else if (err.response.statusCode === 401 ||
                    err.response.statusCode === 404 ||
                    err.response.statusCode === 402) {
                    // this needs more finess
                    console.log('Device should stop')
                    if (state.launcher) {
                        state.launcher.stop()
                        state.launcher = undefined
                    }
                }
            } else {
                if (err.code === 'ECONNREFUSED') {
                    console.log(`Unable to connect to ${state.config.forgeURL}`)
                } else if (err.code === 'ETIMEDOUT') {
                    console.log(`Timeout trying to connect to ${state.config.forgeURL}`)
                }
            }
        })
    }

    async getLatestSnapshot () {
        try {
            const snapshot = await this.client.get('live/snapshot').json()
            console.log(snapshot)
            console.log('downloaded new snapshot')
            return snapshot
        } catch (err) {
            console.log('Problem getting snapshot')
            console.log(err)
        }
    }
}

module.exports = { Pinger }
