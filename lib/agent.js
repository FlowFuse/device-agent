const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const httpClient = require('./http')
const mqttClient = require('./mqtt')
const launcher = require('./launcher.js')
const { info, warn, debug } = require('./logging/log')

const PROJECT_FILE = 'flowforge-project.json'

class Agent {
    constructor (config) {
        this.config = config
        this.startTime = Date.now()
        this.projectFilePath = path.join(this.config.dir, PROJECT_FILE)
        /** @type {import('./AgentManager').AgentManager} */ this.AgentManager = null
        /** @type {import('./http.js').HTTPClient} */ this.httpClient = httpClient.newHTTPClient(this, this.config)
        /** @type {import('./launcher.js').Launcher} */ this.launcher = null
        /** @type {import('./mqtt').MQTTClient} */ this.mqttClient = null
        this.currentSnapshot = null
        this.currentSettings = null
        this.currentProject = null
        this.currentMode = null
        this.updating = false
        this.queuedUpdate = null
        // Track the local state of the agent. Start in 'unknown' state so
        // that the first MQTT checkin will trigger a response
        this.currentState = 'unknown'
    }

    async loadProject () {
        if (existsSync(this.projectFilePath)) {
            try {
                const config = JSON.parse(await fs.readFile(this.projectFilePath, 'utf8'))
                if (config.id) {
                    // Old format
                    this.currentSnapshot = config
                    if (this.currentSnapshot.device) {
                        this.currentSettings = this.currentSnapshot.device
                        delete this.currentSnapshot.device
                    }
                    this.currentProject = null
                } else {
                    // New format
                    this.currentProject = config.project || null
                    this.currentSnapshot = config.snapshot || null
                    this.currentSettings = config.settings || null
                    this.currentMode = config.mode || null
                }
                info(`Instance      : ${this.currentProject || 'unknown'}`)
                info(`Snapshot      : ${this.currentSnapshot?.id || 'none'}`)
                info(`Settings      : ${this.currentSettings?.hash || 'none'}`)
                info(`Operation Mode: ${this.currentMode || 'unknown'}`)
            } catch (err) {
                warn(`Invalid project file: ${this.projectFilePath}`)
            }
        }
    }

    async saveProject () {
        await fs.writeFile(this.projectFilePath, JSON.stringify({
            project: this.currentProject,
            snapshot: this.currentSnapshot,
            settings: this.currentSettings,
            mode: this.currentMode
        }))
    }

    async start () {
        if (this.config?.provisioningMode) {
            this.currentState = 'provisioning'
            await this.httpClient.startPolling()
        } else {
            await this.loadProject()
            if (this.config?.brokerURL) {
                // We have been provided a broker URL to use
                this.mqttClient = mqttClient.newMQTTClient(this, this.config)
                this.mqttClient.start()
                this.mqttClient.setProject(this.currentProject)
                //
            } else {
                this.currentState = 'stopped'
                // Fallback to HTTP polling
                await this.httpClient.startPolling()
            }
        }
        return this.currentState
    }

    async stop () {
        await this.httpClient.stopPolling()
        if (this.mqttClient) {
            this.mqttClient.stop()
        }
        if (this.launcher) {
            await this.launcher.stop()
        }
    }

    async getCurrentPackage () {
        if (this.launcher) {
            return await this.launcher.readPackage()
        }
        return null
    }

    async getCurrentFlows () {
        if (this.launcher) {
            return await this.launcher.readFlow()
        }
        return null
    }

    async getCurrentCredentials () {
        if (this.launcher) {
            return await this.launcher.readCredentials()
        }
        return null
    }

    getState () {
        if (this.updating) {
            return null
        }
        return {
            project: this.currentProject || null,
            snapshot: this.currentSnapshot?.id || null,
            settings: this.currentSettings?.hash || null,
            state: this.launcher?.state || this.currentState,
            mode: this.currentMode || 'autonomous',
            health: {
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                snapshotRestartCount: this.launcher?.restartCount || 0
            },
            agentVersion: this.config.version
        }
    }

    async setState (newState) {
        debug(newState)
        if (this.updating) {
            this.queuedUpdate = newState
            return
        }
        this.updating = true
        if (newState !== null && newState.mode && newState.mode !== this.currentMode) {
            // Device mode has been changed
            // update the local state before processing the new state options
            this.currentMode = newState.mode
            await this.saveProject()
        }
        const inhibitUpdates = this.currentMode === 'developer'

        if (newState === null) {
            // The agent should not be running (bad credentials/device details)
            // Wipe the local configuration
            if (inhibitUpdates === false) {
                this.stop()
                this.currentSnapshot = null
                this.currentProject = null
                this.currentSettings = null
                this.currentMode = null
                await this.saveProject()
                this.currentState = 'stopped'
                this.updating = false
            }
        } else if (inhibitUpdates === false && newState.project === null) {
            if (this.currentProject) {
                debug('Removed from project')
            }
            // Device unassigned from project
            if (this.mqttClient) {
                this.mqttClient.setProject(null)
            }
            // Stop the project if running - with clean flag
            if (this.launcher) {
                await this.launcher.stop(true)
                this.launcher = undefined
            }
            this.currentProject = null
            this.currentSnapshot = null
            // if new settings hash is explicitly null, clear the current settings
            // otherwise, if currentSettings.hash exists, see if it differs from the
            // new settings hash & update accordingly
            if (newState.settings === null) {
                this.currentSettings = null
            } else if (this.currentSettings?.hash) {
                if (this.currentSettings.hash !== newState.settings) {
                    this.currentSettings = await this.httpClient.getSettings()
                }
            }
            await this.saveProject()
            this.currentState = 'stopped'
            this.updating = false
        } else if (inhibitUpdates === false && newState.snapshot === null) {
            // Snapshot removed, but project still active
            if (this.currentSnapshot) {
                debug('Active snapshot removed')
                this.currentSnapshot = null
                await this.saveProject()
            }
            if (Object.prototype.hasOwnProperty.call(newState, 'project')) {
                if (newState.project !== this.currentProject) {
                    this.currentProject = newState.project
                    await this.saveProject()
                    if (this.mqttClient) {
                        this.mqttClient.setProject(this.currentProject)
                    }
                }
            }
            if (this.launcher) {
                await this.launcher.stop(true)
                this.launcher = undefined
            }
            this.currentState = 'stopped'
            this.updating = false
        } else {
            // Check if any updates are needed
            let updateSnapshot = false
            let updateSettings = false
            if (this.currentState === 'unknown' && inhibitUpdates && !this.currentSnapshot && !this.currentProject && newState.project) {
                info('Developer Mode: no flows found - updating to latest snapshot')
                updateSnapshot = true
                updateSettings = true
            } else if (inhibitUpdates === false) {
                if (Object.prototype.hasOwnProperty.call(newState, 'project') && (!this.currentSnapshot || newState.project !== this.currentProject)) {
                    info('New instance assigned')
                    this.currentProject = newState.project
                    // Update everything
                    updateSnapshot = true
                    updateSettings = true
                } else {
                    if (Object.prototype.hasOwnProperty.call(newState, 'snapshot') && (!this.currentSnapshot || newState.snapshot !== this.currentSnapshot.id)) {
                        info('New snapshot available')
                        updateSnapshot = true
                    }
                    if (Object.prototype.hasOwnProperty.call(newState, 'settings') && (!this.currentSettings || newState.settings !== this.currentSettings?.hash)) {
                        info('New settings available')
                        updateSettings = true
                    }
                    if (this.currentSettings === null) {
                        updateSettings = true
                    }
                }
            }
            if (!updateSnapshot && !updateSettings) {
                // Nothing to update.
                // Start the launcher with the current config, Snapshot & settings
                if (!this.launcher && this.currentSnapshot) {
                    this.launcher = launcher.newLauncher(this.config, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                    await this.launcher.start()
                    if (this.mqttClient) {
                        this.mqttClient.setProject(this.currentProject)
                        this.mqttClient.checkIn()
                    }
                    this.currentState = 'stopped'
                }
                this.updating = false
            } else {
                // An update is needed.
                // Stop the launcher if currently running
                this.currentState = 'updating'
                if (this.launcher) {
                    info('Stopping current snapshot')
                    await this.launcher.stop()
                    this.launcher = undefined
                }

                if (updateSnapshot) {
                    this.currentSnapshot = await this.httpClient.getSnapshot()
                }
                if (updateSettings) {
                    this.currentSettings = await this.httpClient.getSettings()
                }
                if (this.currentSnapshot?.id) {
                    try {
                        // There is a new snapshot/settings to use
                        info(`Instance: ${this.currentProject || 'unknown'}`)
                        info(`Snapshot: ${this.currentSnapshot.id}`)
                        info(`Settings: ${this.currentSettings?.hash || 'none'}`)
                        await this.saveProject()
                        this.launcher = launcher.newLauncher(this.config, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                        await this.launcher.writeConfiguration()
                        await this.launcher.start()
                        if (this.mqttClient) {
                            this.mqttClient.setProject(this.currentProject)
                            this.mqttClient.checkIn()
                        }
                    } catch (err) {
                        warn(`Error whilst starting Node-RED: ${err.toString()}`)
                        if (this.launcher) {
                            await this.launcher.stop(true)
                        }
                        this.launcher = undefined
                    }
                }
            }
        }
        this.currentState = this.launcher ? 'running' : 'stopped'
        this.updating = false
        if (this.queuedUpdate) {
            const update = this.queuedUpdate
            this.queuedUpdate = null
            this.setState(update)
        }
    }
}

module.exports = {
    newAgent: (config) => new Agent(config),
    Agent
}
