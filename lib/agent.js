const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const httpClient = require('./http')
const mqttClient = require('./mqtt')
const Launcher = require('./launcher.js')
const { info, warn, debug } = require('./logging/log')
const utils = require('./utils.js')

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
        this.currentMode = 'autonomous'
        this.updating = false
        this.queuedUpdate = null
        // Track the local state of the agent. Start in 'unknown' state so
        // that the first MQTT check-in will trigger a response
        this.currentState = 'unknown'
        // ensure licensed property is present (default to null)
        if (Object.prototype.hasOwnProperty.call(this.config, 'licensed') === false) {
            this.config.licensed = null
        }
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
                    this.currentMode = config.mode || 'autonomous'
                    this.config.licensed = config.licensed || null
                }
                this.printAgentStatus()
            } catch (err) {
                warn(`Invalid project file: ${this.projectFilePath}`)
            }
        }
    }

    printAgentStatus () {
        info('Configuration :-')
        info(`  * Instance         : ${this.currentProject || 'unknown'}`)
        info(`  * Snapshot         : ${this.currentSnapshot?.id || 'none'}`)
        info(`  * Settings         : ${this.currentSettings?.hash || 'none'}`)
        info(`  * Operation Mode   : ${this.currentMode || 'unknown'}`)
        info(`  * Licensed         : ${this.config.licensed === null ? 'unknown' : this.config.licensed ? 'yes' : 'no'}`)
        if (typeof this.currentSettings?.env === 'object') {
            info('Environment :-')
            info(`  * FF_SNAPSHOT_ID   : ${this.currentSettings.env.FF_SNAPSHOT_ID || ''}`)
            info(`  * FF_SNAPSHOT_NAME : ${this.currentSettings.env.FF_SNAPSHOT_NAME || ''}`)
            info(`  * FF_DEVICE_ID     : ${this.currentSettings.env.FF_DEVICE_ID || ''}`)
            info(`  * FF_DEVICE_NAME   : ${this.currentSettings.env.FF_DEVICE_NAME || ''}`)
            info(`  * FF_DEVICE_TYPE   : ${this.currentSettings.env.FF_DEVICE_TYPE || ''}`)
        }
    }

    async saveProject () {
        await fs.writeFile(this.projectFilePath, JSON.stringify({
            project: this.currentProject,
            snapshot: this.currentSnapshot,
            settings: this.currentSettings,
            mode: this.currentMode,
            licensed: this.config.licensed
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
            mode: this.currentMode,
            health: {
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                snapshotRestartCount: this.launcher?.restartCount || 0
            },
            agentVersion: this.config.version,
            licensed: this.config.licensed
        }
    }

    async setState (newState) {
        debug(newState)
        if (this.updating) {
            this.queuedUpdate = newState
            return
        }
        this.updating = true

        // store license status - this property can be used for enabling EE features
        if (newState && Object.prototype.hasOwnProperty.call(newState, 'licensed') && typeof newState.licensed === 'boolean') {
            const licenseChanged = newState.licensed !== this.config.licensed
            if (licenseChanged) {
                this.config.licensed = newState.licensed
                this.saveProject() // update project file
                if (this.config.licensed) {
                    info('License enabled')
                    // TODO: handle license change disabled -> enabled. Flag for reload?
                } else {
                    info('License disabled')
                    // TODO: handle license change enabled -> disabled. Flag for reload?
                }
            }
        }
        /** `forgeSnapshot` will be set to the current snapshot in the forge platform *if required* */
        let forgeSnapshot = null

        // first, check if the new state indicates a change of operation mode from the current mode
        // When changing from developer mode to autonomous mode, we need to check if the flows/modules
        // for Node-RED were changed vs the current snapshot on the forge platform.
        // If they differ, we flag that a reload of the snapshot is required.
        if (newState !== null && newState.mode && newState.mode !== this.currentMode) {
            if (!['developer', 'autonomous'].includes(newState.mode)) {
                newState.mode = 'autonomous'
            }
            if (!this.currentMode) {
                this.currentMode = newState.mode
            } else if (this.currentMode !== newState.mode) {
                this.currentMode = newState.mode
                if (newState.mode === 'developer') {
                    info('Enabling developer mode')
                    await this.saveProject()
                } else {
                    let _launcher = this.launcher
                    if (!_launcher) {
                        // create a temporary launcher to read the current snapshot on disk
                        _launcher = Launcher.newLauncher(this.config, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                    }
                    forgeSnapshot = await this.httpClient.getSnapshot()
                    // before checking for changed flows etc, check if the snapshot on disk is the same as the snapshot on the forge platform
                    // if it has changed, we need to reload the snapshot from the forge platform
                    if (forgeSnapshot?.id !== _launcher.snapshot?.id) {
                        info('Local snapshot differs from snapshot on the forge platform')
                        newState.reloadSnapshot = true
                    }

                    // next check the key system environment variables match
                    if (newState.reloadSnapshot !== true) {
                        if (typeof forgeSnapshot?.env === 'object' && typeof _launcher.snapshot?.env === 'object') {
                            const checkMatch = (key) => {
                                return (forgeSnapshot.env[key] || null) === (_launcher.snapshot.env[key] || null)
                            }
                            const matchOk = checkMatch('FF_SNAPSHOT_ID') && checkMatch('FF_SNAPSHOT_NAME') && checkMatch('FF_DEVICE_ID') && checkMatch('FF_DEVICE_NAME') && checkMatch('FF_DEVICE_TYPE')
                            if (matchOk === false) {
                                info('Local snapshot predefined environment variables differ from snapshot on the forge platform')
                                newState.reloadSnapshot = true
                            }
                        }
                    }

                    if (newState.reloadSnapshot !== true) {
                        try {
                            const modules = (await _launcher.readPackage())?.modules
                            const flows = await _launcher.readFlow()
                            const diskSnapshot = { flows, modules }
                            newState.reloadSnapshot = utils.compareNodeRedData(forgeSnapshot, diskSnapshot) === false
                        } catch (error) {
                            info('An error occurred while attempting to read flows & package file from disk')
                            newState.reloadSnapshot = true
                        }
                    }
                    if (newState.reloadSnapshot) {
                        info('Local flows have changed. Restoring current snapshot')
                    } else {
                        // only save the project if the snapshot is not being reloaded
                        // since the snapshot will be reloaded and the project will be saved then
                        await this.saveProject()
                    }
                    info('Disabling developer mode')
                }
                // report the new mode for more instantaneous feedback (improve the UX)
                this.checkIn(2)
            }
        }

        /** A flag to inhibit updates if we are in developer mode */
        const inhibitUpdates = this.currentMode === 'developer'

        /** A flag to indicate execution should skip to the update step */
        const skipToUpdate = newState?.reloadSnapshot === true

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
        } else if (!skipToUpdate && inhibitUpdates === false && newState.project === null) {
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
        } else if (!skipToUpdate && inhibitUpdates === false && newState.snapshot === null) {
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
                this.currentProject = newState.project
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

                    // reloadSnapshot is a special case - it is used to force a reload of the current
                    // snapshot following a change from autonomous to developer mode
                    if (newState.reloadSnapshot === true && updateSnapshot === false) {
                        info('Reload snapshot requested')
                        updateSnapshot = true
                    }
                    if (Object.prototype.hasOwnProperty.call(newState, 'settings') && (!this.currentSettings || newState.settings !== this.currentSettings?.hash)) {
                        info('New settings available')
                        updateSettings = true
                    }
                    if (this.currentSettings === null) {
                        updateSettings = true
                    }
                    // If the snapshot is to be updated, the settings must also be updated
                    // this is because snapshot includes special, platform defined environment variables e.g. FF_SNAPSHOT_ID
                    if (updateSnapshot === true) {
                        updateSettings = true
                    }
                }
            }
            if (!skipToUpdate && !updateSnapshot && !updateSettings) {
                // Nothing to update.
                // Start the launcher with the current config, Snapshot & settings
                if (!this.launcher && this.currentSnapshot) {
                    this.launcher = Launcher.newLauncher(this.config, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                    await this.launcher.start()
                    if (this.mqttClient) {
                        this.mqttClient.setProject(this.currentProject)
                    }
                    this.checkIn(2)
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
                    this.currentSnapshot = forgeSnapshot || await this.httpClient.getSnapshot()
                }
                if (updateSettings) {
                    this.currentSettings = await this.httpClient.getSettings()
                }
                if (this.currentSnapshot?.id) {
                    try {
                        // There is a new snapshot/settings to use
                        this.printAgentStatus() // provide info update to console
                        await this.saveProject()
                        this.launcher = Launcher.newLauncher(this.config, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                        await this.launcher.writeConfiguration()
                        await this.launcher.start()
                        if (this.mqttClient) {
                            this.mqttClient.setProject(this.currentProject)
                        }
                        this.checkIn(2)
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

    /**
     * Check in with the platform to report the current state of the agent
     * NOTE: If retries is `0` or is not provided, the check-in will be attempted only once.
     * @param {Number} [retries=0] - (Optional, Default: 0, Max: 5) number of retries to attempt if the agent is busy updating.
     * @param {Number} [retryDelay=100] - (Optional, Default: 100, Min: 100, Max: 1000) delay in milliseconds between retries
     */
    async checkIn (retries = 0, retryDelay = 100) {
        retries = Number.isInteger(retries) ? retries : 0 // default to 0 retries
        retryDelay = Number.isInteger(retryDelay) ? retryDelay : 100 // default to 100ms
        retryDelay = Math.min(1000, Math.max(100, retryDelay)) // clamp to 100-1000ms
        retries = Math.min(5, Math.max(0, retries)) // clamp to 0-5 retries

        if (this.updating && retries > 0) {
            debug('Cannot check-in: Agent is busy updating. Retrying in 100ms')
            // call this function again in 100ms
            setTimeout(() => {
                this.checkIn(retries - 1)
            }, retryDelay)
            return
        }

        if (this.mqttClient) {
            this.mqttClient.checkIn()
        } else if (this.httpClient) {
            await this.httpClient.checkIn()
        } else {
            debug('No MQTT or HTTP client available to check-in with')
        }
    }
}

module.exports = {
    newAgent: (config) => new Agent(config),
    Agent
}
