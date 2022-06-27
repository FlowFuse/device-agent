const { existsSync } = require('fs')
const fs = require('fs/promises')
const got = require('got')
const path = require('path')
const { info, warn, debug } = require('./log')
const { Launcher } = require('./launcher.js')

const PROJECT_FILE = 'flowforge-project.json'
/*
 * Sends regular heartbeat to Forge instance and then
 * downloads any changes to the Project Snapshot
 */
class Pinger {
    constructor (config) {
        this.startTime = Date.now()
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
        this.projectFilePath = path.join(this.config.dir, PROJECT_FILE)
    }

    async start () {
        if (existsSync(this.projectFilePath)) {
            try {
                const snapshot = JSON.parse(await fs.readFile(this.projectFilePath, 'utf8'))
                if (snapshot.id) {
                    this.currentSnapshot = snapshot
                    info(`Current snapshot: ${this.currentSnapshot.id}`)
                } else {
                    warn(`Invalid project file: ${this.projectFilePath}`)
                }
            } catch (err) {
                warn(`Invalid project file: ${this.projectFilePath}`)
            }
        } else {
            info('No active snapshot')
        }
        this.downloading = false
        this.startChecking()
        this.checkIn()
    }

    async stop (clean) {
        this.stopChecking()
        if (this.launcher) {
            await this.launcher.stop(clean)
        }
    }

    startChecking () {
        const period = this.config.interval || 60
        info(`Starting ping thread. Interval: ${period}s`)
        this.interval = setInterval(() => {
            this.checkIn()
        }, period * 1000)
    }

    stopChecking () {
        if (this.interval) {
            info('Stopping ping thread')
            clearInterval(this.interval)
            this.interval = undefined
        }
    }

    async checkIn () {
        const state = this
        if (!state.downloading) {
            const payload = {
                snapshot: state.currentSnapshot?.id || null,
                state: this.launcher ? this.launcher.state : 'stopped',
                health: {
                    uptime: Math.floor((Date.now() - this.startTime) / 1000),
                    snapshotRestartCount: this.launcher ? this.launcher.restartCount : 0
                }
            }
            info('Calling home')
            debug(JSON.stringify(payload, null, 2))
            state.downloading = true

            this.client.post('live/state', {
                json: payload
            }).then(async body => {
                // all good
                info('No updated needed')
                if (!state.launcher && state.currentSnapshot) {
                    state.launcher = Launcher(state.config, state.currentSnapshot)
                    await state.launcher.start()
                }
                state.downloading = false
            }).catch(async err => {
                if (err.response) {
                    if (err.response.statusCode === 409) {
                        const response = JSON.parse(err.response.body)
                        console.log(response)
                        if (response.snapshot) {
                            info('New snapshot available')
                        } else {
                            info('New settings available')
                        }
                        state.downloading = true
                        const snapshot = await this.getLatestSnapshot()
                        snapshot.device = await this.getSettings()
                        if (snapshot.id) {
                            info(`New snapshot: ${snapshot.id}`)
                            state.currentSnapshot = snapshot
                            if (state.launcher) {
                                info('Stopping current snapshot')
                                await state.launcher.stop()
                                state.launcher = undefined
                            }
                            await fs.writeFile(this.projectFilePath, JSON.stringify(snapshot))
                            state.launcher = Launcher(this.config, snapshot)
                            await state.launcher.writeConfiguration()
                            await state.launcher.start()
                            state.downloading = false
                        } else {
                            info('No active snapshot')
                            await fs.rm(this.projectFilePath, { force: true })
                            if (state.launcher) {
                                await state.launcher.stop(true)
                                state.launcher = undefined
                            }
                            state.currentSnapshot = null
                            state.downloading = false
                        }
                    } else if (err.response.statusCode === 404) {
                        warn('Unknown device. Shutting down')
                        state.downloading = false
                        await this.stop(true)
                    } else if (err.response.statusCode === 401) {
                        warn('Invalid device credentials. Shutting down')
                        state.downloading = false
                        await this.stop(true)
                    } else {
                        state.downloading = false
                        warn(`Unexpected call home error: ${err.toString()}`)
                    }
                } else {
                    state.downloading = false
                    if (err.code === 'ECONNREFUSED') {
                        warn(`Unable to connect to ${state.config.forgeURL}`)
                    } else if (err.code === 'ETIMEDOUT') {
                        warn(`Timeout trying to connect to ${state.config.forgeURL}`)
                    } else {
                        warn(`Error whilst starting project: ${err.toString()}`)
                        if ( state.launcher) {
                            await state.launcher.stop(true)
                        }
                        state.downloading = false
                        state.launcher = undefined
                    }
                }
            }).catch(async err => {
                warn(`Error whilst starting project: ${err.toString()}`)
                if (state.launcher) {
                    await state.launcher.stop(true)
                }
                state.downloading = false
                state.launcher = undefined
            })
        } else {
            info('Skipping call home whilst update in progress')
        }
    }

    async getLatestSnapshot () {
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
}

module.exports = {
    Pinger: (config) => new Pinger(config)
}
