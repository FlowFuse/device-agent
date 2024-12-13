const { IntervalJitter } = require('./IntervalJitter')
const { existsSync } = require('fs')
const { randomInt } = require('crypto')
const fs = require('fs/promises')
const { readFileSync } = require('fs')
const path = require('path')
const httpClient = require('./http')
const mqttClient = require('./mqtt')
const Launcher = require('./launcher.js')
const { info, warn, debug } = require('./logging/log')
const utils = require('./utils.js')
const { States, isTargetState, isValidState } = require('./states')
const MQTT_CONNECT_DELAY_MAX = process.env.NODE_ENV === 'test' ? 25 : 5000

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
        this.currentApplication = null
        this.currentMode = 'autonomous'
        this.targetState = config.targetState || States.RUNNING
        this.updating = false
        this.queuedUpdate = null
        /** @type {IntervalJitter} a timer for scheduling retries of `setState()` */
        this.retrySetStateTimer = new IntervalJitter()
        // Track the local state of the agent. Start in 'unknown' state so
        // that the first MQTT check-in will trigger a response
        this.currentState = States.UNKNOWN
        this.editorToken = null
        this.editorAffinity = null
        // ensure licensed property is present (default to null)
        if (utils.hasProperty(this.config, 'licensed') === false) {
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
                    this.currentApplication = null
                    this.editorToken = null
                    this.editorAffinity = null
                } else {
                    // New format
                    this.currentApplication = config.project ? null : (config.application || null)
                    this.currentProject = config.project || null
                    this.currentSnapshot = config.snapshot || null
                    this.currentSettings = config.settings || null
                    this.currentMode = config.mode || 'autonomous'
                    this.targetState = isTargetState(config.targetState) ? config.targetState : States.RUNNING
                    this.config.licensed = config.licensed || null
                    this.editorToken = config.editorToken || null
                    this.editorAffinity = config.editorAffinity || null
                }
                this.printAgentStatus()
            } catch (err) {
                warn(`Invalid project file: ${this.projectFilePath}`)
            }
        }
    }

    printAgentStatus (title = null) {
        if (title) {
            info(title)
        }
        info('Configuration :-')
        if (this.currentOwnerType === 'application') {
            info(`  * Application        : ${this.currentApplication}`)
            info('  * Snapshot           : none') // TODO: remove this when we have a better solution for snapshots on devices at application level
        } else {
            info(`  * Instance           : ${this.currentProject || 'unknown'}`)
            info(`  * Snapshot           : ${this.currentSnapshot?.id || 'none'}`)
        }
        info(`  * Settings           : ${this.currentSettings?.hash || 'none'}`)
        info(`  * Operation Mode     : ${this.currentMode || 'unknown'}`)
        info(`  * Target State       : ${this.targetState || States.RUNNING}`)
        info(`  * Licensed           : ${this.config.licensed === null ? 'unknown' : this.config.licensed ? 'yes' : 'no'}`)
        if (typeof this.currentSettings?.env === 'object') {
            info('Environment :-')
            info(`  * FF_DEVICE_ID       : ${this.currentSettings.env.FF_DEVICE_ID || ''}`)
            info(`  * FF_DEVICE_NAME     : ${this.currentSettings.env.FF_DEVICE_NAME || ''}`)
            info(`  * FF_DEVICE_TYPE     : ${this.currentSettings.env.FF_DEVICE_TYPE || ''}`)
            if (this.currentOwnerType === 'application') {
                info(`  * FF_APPLICATION_ID  : ${this.currentSettings.env.FF_APPLICATION_ID || ''}`)
                info(`  * FF_APPLICATION_NAME: ${this.currentSettings.env.FF_APPLICATION_NAME || ''}`)
            }
            info(`  * FF_SNAPSHOT_ID     : ${this.currentSettings.env.FF_SNAPSHOT_ID || ''}`)
            info(`  * FF_SNAPSHOT_NAME   : ${this.currentSettings.env.FF_SNAPSHOT_NAME || ''}`)
        }
    }

    async saveProject () {
        await fs.writeFile(this.projectFilePath, JSON.stringify({
            ownerType: this.currentOwnerType,
            application: this.currentApplication,
            project: this.currentProject,
            snapshot: this.currentSnapshot,
            settings: this.currentSettings,
            mode: this.currentMode,
            targetState: this.targetState,
            licensed: this.config.licensed,
            editorToken: this.editorToken,
            editorAffinity: this.editorAffinity
        }))
    }

    async start () {
        if (this.config?.provisioningMode) {
            this.currentState = States.PROVISIONING
            await this.httpClient.startPolling()
        } else {
            await this.loadProject()
            if (this.config?.brokerURL) {
                // ensure http comms are stopped if using MQTT
                this.httpClient.stopPolling()
                // ensure any existing MQTT comms are stopped before initiating new ones
                if (this.mqttClient) {
                    this.mqttClient.stop()
                }
                // We have been provided a broker URL to use
                this.mqttClient = mqttClient.newMQTTClient(this, this.config)
                // Wait a short random delay to reduce stress on broker when large numbers of devices come on-line
                await new Promise(_resolve => setTimeout(_resolve, randomInt(20, MQTT_CONNECT_DELAY_MAX)))
                this.mqttClient.start()
                this.mqttClient.setApplication(this.currentApplication)
                this.mqttClient.setProject(this.currentProject)
            } else {
                // ensure MQTT comms are stopped if switching to HTTP
                if (this.mqttClient && this.config?.brokerURL) {
                    this.mqttClient.stop()
                }
                this.currentState = States.STOPPED
                // Fallback to HTTP polling
                await this.httpClient.startPolling()
            }
        }
        return this.currentState
    }

    async stop () {
        // Stop the launcher before stopping http/mqtt channels to permit
        // audit logging and  status updates to the platform
        if (this.launcher) {
            // Stop the launcher using non std state 'shutdown' to indicate a shutdown.
            // This is mainly for consistent logging and preventing the auto restart
            // logic kicking in when the agent is stopped
            await this.launcher.stop(false, 'shutdown')
            this.launcher = undefined
        }
        await this.httpClient.stopPolling()
        if (this.mqttClient) {
            this.mqttClient.stop()
        }
    }

    async restartNR () {
        this.currentState = States.RESTARTING
        this.retrySetState(false) // clear any retry timers
        if (this.launcher) {
            // Stop the launcher using the state 'restarting'
            // This will not be persisted to the targetState property
            // It indicates the launcher it should not attempt to auto restart
            // the NR process but permit the process to exit gracefully
            await this.launcher.stop(false, States.RESTARTING)
            this.launcher = undefined
        }
        await this.updateTargetState(States.RUNNING)
        await this.setState({ targetState: States.RUNNING })
        return this.targetState === States.RUNNING
    }

    async startNR () {
        await this.updateTargetState(States.RUNNING)
        await this.setState({ targetState: States.RUNNING })
        return this.targetState === States.RUNNING
    }

    async suspendNR () {
        this.retrySetState(false) // clear any retry timers
        // update the settings to indicate the device is suspended so that upon
        // a reboot the device agent will not start the launcher
        const result = await this.updateTargetState(States.SUSPENDED)
        if (this.launcher) {
            await this.launcher.stop(false, States.SUSPENDED)
            this.launcher = undefined
            this.currentState = States.SUSPENDED
        }
        return result && this.targetState === States.SUSPENDED
    }

    async updateTargetState (newState) {
        if (isTargetState(newState)) {
            const changed = this.targetState !== newState
            this.targetState = newState
            if (changed) {
                this.retrySetState(false) // clear any retry timers
                this.targetState = newState
                await this.saveProject()
            }
            return true
        }
        return false
    }

    async getCurrentPackage () {
        if (this.launcher) {
            return this.launcher.readPackage()
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
        const state = {
            ownerType: this.currentOwnerType,
            project: this.currentProject || null,
            application: this.currentApplication || null,
            snapshot: this.currentSnapshot?.id || null,
            settings: this.currentSettings?.hash || null,
            state: this.launcher?.state || this.currentState,
            mode: this.currentMode,
            targetState: this.targetState,
            health: {
                uptime: Math.floor((Date.now() - this.startTime) / 1000),
                snapshotRestartCount: this.launcher?.restartCount || 0
            },
            agentVersion: this.config.version,
            licensed: this.config.licensed
        }
        if (this.launcher?.readPackage) {
            const { modules } = this.launcher.readPackage()
            if (modules['node-red'] !== 'latest') {
                state.nodeRedVersion = modules['node-red']
            } else {
                const nrPackPath = path.join(this.launcher.projectDir, 'node_modules/node-red/package.json')
                const content = readFileSync(nrPackPath)
                const packJSON = JSON.parse(content)
                state.nodeRedVersion = packJSON.version
            }
        }
        if (this.currentMode === 'developer' && this.editorToken && this.editorAffinity) {
            state.affinity = this.editorAffinity
        }
        return state
    }

    /**
     * @type {('none'|'application'|'project')}
     * Returns the current owner type of the agent
     */
    get currentOwnerType () {
        return this.currentProject ? 'project' : (this.currentApplication ? 'application' : 'none')
    }

    static normaliseStateObject (newState) {
        // if the new state is null or not an object, set it to null
        // this is necessary since explicit "no state" check is a comparison to `null`
        if (newState === null || typeof newState !== 'object') {
            return null
        }
        // for backwards compatibility, check if the new state object has a property named "ownerType"
        // if not, try to determine it from properties. NOTE: Project takes precedence over application.
        // This permits us to migrate to a future where a device have an application and a project value at the same time
        // This aligns with the getter "currentOwnerType" which also gives precedence to project over application
        if (utils.hasProperty(newState, 'ownerType') === false || newState.ownerType === null) {
            newState.ownerType = newState.project ? 'project' : (newState.application ? 'application' : 'none')
        }
    }

    async setState (newState) {
        debug(JSON.stringify(newState))

        // If busy updating, queue the update
        if (this.updating) {
            const queuedUpdateIsTargetStateChange = this.queuedUpdate && typeof this.queuedUpdate === 'object' && utils.hasProperty(this.queuedUpdate, 'targetState')
            if (queuedUpdateIsTargetStateChange) {
                // the queued update is a target state change request, lets not overwrite it
                // unless the new state is also a target state change request
                const newStateIsTargetStateChange = typeof newState === 'object' && utils.hasProperty(newState, 'targetState')
                if (newStateIsTargetStateChange) {
                    this.queuedUpdate = newState
                }
                return
            }
            this.queuedUpdate = newState
            return
        }

        try {
            this.updating = true
            // normalise the state object
            Agent.normaliseStateObject(newState)

            // store license status - this property can be used for enabling EE features
            if (newState && utils.hasProperty(newState, 'licensed') && typeof newState.licensed === 'boolean') {
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

            // check to see if this is run state change request
            if (typeof newState === 'object' && utils.hasProperty(newState, 'targetState')) {
                if (isTargetState(newState.targetState)) {
                    const changed = newState.targetState !== this.targetState
                    this.targetState = newState.targetState
                    await this.saveProject()
                    if (changed) {
                        this.retrySetState(false) // since this is a target state change, cancel any retry timers
                    }
                }
                delete newState.targetState
            }

            // next, check if the new state indicates a change of operation mode from the current mode
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
                        // exiting developer mode
                        this.editorToken = null
                        this.editorAffinity = null
                        let _launcher = this.launcher
                        if (!_launcher) {
                            // create a temporary launcher to read the current snapshot on disk
                            _launcher = Launcher.newLauncher(this, this.currentApplication, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                        }

                        try {
                            forgeSnapshot = await this.httpClient.getSnapshot()
                            this.retrySetState(false) // success - stop retry timer
                        } catch (err) {
                            if (!this.retrySetStateTimer.isRunning) {
                                this.currentState = States.ERROR
                                warn(`Problem getting snapshot: ${err.toString()}`)
                                debug(err)
                                this.retrySetState(newState)
                            }
                            this.updating = false
                            this.currentState = States.ERROR
                            this.queuedUpdate = null // we are in error state, clear any queued updates, halt!
                            return
                        }

                        // before checking for changed flows etc, check if the snapshot on disk is the same as the snapshot on the forge platform
                        // if it has changed, we need to reload the snapshot from the forge platform
                        if (forgeSnapshot?.id !== _launcher.snapshot?.id) {
                            info('Local snapshot ID differs from the snapshot on the forge platform')
                            newState.reloadSnapshot = true
                        }

                        // next check the key system environment variables match
                        if (newState.reloadSnapshot !== true) {
                            const checkMatch = (key) => {
                                return (forgeSnapshot?.env[key] || null) === (_launcher?.snapshot?.env[key] || null)
                            }

                            if (newState.ownerType === 'application') {
                                // TODO: Since this is an early MVP of devices at application level, we fake any updates to the snapshot
                                //       We DONT reload the snapshot from the forge platform because we don't want to overwrite any local
                                //       changes made to flows and modules. This is a temporary workaround until we have a better solution
                                if (typeof forgeSnapshot?.env === 'object' && typeof _launcher.snapshot?.env === 'object') {
                                    const matchOk = checkMatch('FF_SNAPSHOT_ID') && checkMatch('FF_SNAPSHOT_NAME') && checkMatch('FF_DEVICE_ID') && checkMatch('FF_DEVICE_NAME') && checkMatch('FF_DEVICE_TYPE') && checkMatch('FF_APPLICATION_ID') && checkMatch('FF_APPLICATION_NAME')
                                    if (matchOk === false) {
                                        info('Local environment variables differ from the snapshot on the forge platform')
                                        // manually update the snapshot to match the snapshot from the forge platform
                                        // this is a temporary workaround until we have a better solution for devices at application level
                                        this.currentSnapshot.env.FF_SNAPSHOT_ID = forgeSnapshot.env.FF_SNAPSHOT_ID
                                        this.currentSnapshot.env.FF_SNAPSHOT_NAME = forgeSnapshot.env.FF_SNAPSHOT_NAME
                                        this.currentSnapshot.env.FF_DEVICE_ID = forgeSnapshot.env.FF_DEVICE_ID
                                        this.currentSnapshot.env.FF_DEVICE_NAME = forgeSnapshot.env.FF_DEVICE_NAME
                                        this.currentSnapshot.env.FF_DEVICE_TYPE = forgeSnapshot.env.FF_DEVICE_TYPE
                                        this.currentSnapshot.env.FF_APPLICATION_ID = forgeSnapshot.env.FF_APPLICATION_ID
                                        this.currentSnapshot.env.FF_APPLICATION_NAME = forgeSnapshot.env.FF_APPLICATION_NAME
                                    }
                                }
                            } else {
                                if (typeof forgeSnapshot?.env === 'object' && typeof _launcher.snapshot?.env === 'object') {
                                    const matchOk = checkMatch('FF_SNAPSHOT_ID') && checkMatch('FF_SNAPSHOT_NAME') && checkMatch('FF_DEVICE_ID') && checkMatch('FF_DEVICE_NAME') && checkMatch('FF_DEVICE_TYPE')
                                    if (matchOk === false) {
                                        info('Local environment variables differ from the snapshot on the forge platform')
                                        newState.reloadSnapshot = true
                                    }
                                }
                            }
                        }

                        // Do a full comparison if this is NOT an application with a "starter" snapshot ID of "0"
                        const doFull = !(newState.ownerType === 'application' && newState.snapshot === '0')
                        if (doFull && newState.reloadSnapshot !== true) {
                            let diskSnapshot = { flows: [], modules: {} }
                            try {
                                const modules = (_launcher.readPackage())?.modules
                                const flows = await _launcher.readFlow()
                                diskSnapshot = { flows, modules }
                            } catch (error) {
                                info('An error occurred while attempting to read flows & package file from disk')
                                newState.reloadSnapshot = true
                            }
                            const changes = utils.compareNodeRedData(forgeSnapshot, diskSnapshot) === false
                            if (changes) {
                                info('Local flows differ from the snapshot on the forge platform')
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
            const developerMode = this.currentMode === 'developer'

            /** A flag to indicate execution should skip to the update step */
            const skipToUpdate = newState?.reloadSnapshot === true

            if (newState === null) {
                // The agent should not be running (bad credentials/device details)
                // Wipe the local configuration
                if (developerMode === false) {
                    await this.stop()
                    this.currentSnapshot = null
                    this.currentApplication = null
                    this.currentProject = null
                    this.currentSettings = null
                    this.currentMode = null
                    this.editorToken = null
                    this.editorAffinity = null
                    await this.saveProject()
                    this.currentState = States.STOPPED
                    this.updating = false
                }
            } else if (!skipToUpdate && developerMode === false && newState.application === null && this.currentOwnerType === 'application') {
                if (this.currentApplication) {
                    debug('Removed from application')
                }
                // Device unassigned from application
                if (this.mqttClient) {
                    this.mqttClient.setApplication(null)
                }
                // Stop the device if running - with clean flag
                if (this.launcher) {
                    await this.launcher.stop(true)
                    this.launcher = undefined
                }
                this.currentApplication = null
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
                this.currentState = States.STOPPED
                this.updating = false
            } else if (!skipToUpdate && developerMode === false && newState.project === null && this.currentOwnerType === 'project') {
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
                this.currentState = States.STOPPED
                this.updating = false
            } else if (!skipToUpdate && developerMode === false && newState.snapshot === null) {
                // Snapshot removed, but project/application still set
                if (this.currentSnapshot) {
                    debug('Active snapshot removed')
                    this.currentSnapshot = null
                    await this.saveProject()
                }
                let setApp = false
                let setProject = false
                if (utils.hasProperty(newState, 'application')) {
                    if (newState.application !== this.currentApplication) {
                        this.currentApplication = newState.application
                        setApp = true
                    }
                }
                if (utils.hasProperty(newState, 'project')) {
                    if (newState.project !== this.currentProject) {
                        this.currentProject = newState.project
                        setProject = true
                    }
                }

                if (this.mqttClient) {
                    if (setApp) {
                        this.mqttClient.setProject(null)
                        this.mqttClient.setApplication(this.currentApplication)
                    }
                    if (setProject) {
                        this.mqttClient.setApplication(null)
                        this.mqttClient.setProject(this.currentProject)
                    }
                }

                if (setApp || setProject) {
                    await this.saveProject()
                    this.checkIn(2)
                }

                if (this.launcher) {
                    await this.launcher.stop(true)
                    this.launcher = undefined
                }
                this.currentState = States.STOPPED
                this.updating = false
            } else {
                // Check if any updates are needed
                let updateSnapshot = false
                let updateSettings = false
                const unknownOrStopped = (this.currentState === States.UNKNOWN || this.currentState === States.STOPPED)
                const snapShotUpdatePending = !!(!this.currentSnapshot && newState.snapshot)
                const projectUpdatePending = !!(newState.ownerType === 'project' && !this.currentProject && newState.project)
                const applicationUpdatePending = !!(newState.ownerType === 'application' && !this.currentApplication && newState.application)
                if (unknownOrStopped && developerMode && snapShotUpdatePending && (projectUpdatePending || applicationUpdatePending)) {
                    info('Developer Mode: no flows found - updating to latest snapshot')
                    this.currentProject = newState.project
                    this.currentApplication = newState.application
                    updateSnapshot = true
                    updateSettings = true
                } else if (developerMode === false) {
                    if (utils.hasProperty(newState, 'project') && (!this.currentSnapshot || newState.project !== this.currentProject)) {
                        info('New instance assigned')
                        this.currentApplication = null
                        this.currentProject = newState.project
                        // Update everything
                        updateSnapshot = true
                        updateSettings = true
                    } else if (utils.hasProperty(newState, 'application') && (!this.currentSnapshot || newState.application !== this.currentApplication)) {
                        info('New application assigned')
                        this.currentProject = null
                        this.currentApplication = newState.application
                        // Update everything
                        updateSnapshot = true
                        updateSettings = true
                    } else {
                        if (utils.hasProperty(newState, 'snapshot') && (!this.currentSnapshot || newState.snapshot !== this.currentSnapshot.id)) {
                            info('New snapshot available')
                            updateSnapshot = true
                        }

                        // reloadSnapshot is a special case - it is used to force a reload of the current
                        // snapshot following a change from autonomous to developer mode
                        if (newState.reloadSnapshot === true && updateSnapshot === false) {
                            info('Reload snapshot requested')
                            updateSnapshot = true
                        }
                        if (utils.hasProperty(newState, 'settings') && (!this.currentSettings || newState.settings !== this.currentSettings?.hash)) {
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
                        // one time check to see if settings for assistant are missing (added in > v2.6.0+)
                        if (!this.oneTimeAssistantCheck && this.currentSettings && !this.currentSettings?.assistant && this.currentSnapshot?.modules?.['@flowfuse/nr-assistant']) {
                            info('Assistant settings not found')
                            updateSettings = true
                        }
                        this.oneTimeAssistantCheck = true
                    }
                }
                if (!skipToUpdate && !updateSnapshot && !updateSettings) {
                    // Nothing to update. So long as the target state is not SUSPENDED,
                    // start the launcher with the current config, Snapshot & settings
                    if (!this.launcher && this.currentSnapshot && this.targetState !== States.SUSPENDED) {
                        this.launcher = Launcher.newLauncher(this, this.currentApplication, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                        await this.launcher.start()
                        if (this.mqttClient) {
                            this.mqttClient.setProject(this.currentProject)
                            this.mqttClient.setApplication(this.currentApplication)
                            if (developerMode && this.editorToken && this.launcher) {
                                this.mqttClient.startTunnel(this.editorToken, this.editorAffinity)
                            }
                        }
                        this.currentState = this.launcher.state
                        this.checkIn(2)
                    }
                    this.updating = false
                } else {
                    // At this point of the state machine, we are to stop the launcher and update the snapshot and/or settings
                    // then start the launcher with the new snapshot and/or settings

                    // Stop the launcher if currently running
                    this.currentState = States.UPDATING
                    if (this.launcher) {
                        info('Stopping current snapshot')
                        await this.launcher.stop(false, States.UPDATING)
                        this.launcher = undefined
                    }

                    if (updateSnapshot) {
                        try {
                            this.currentSnapshot = forgeSnapshot || await this.httpClient.getSnapshot()
                            this.retrySetState(false) // success - stop retry timer
                        } catch (err) {
                            if (!this.retrySetStateTimer.isRunning) {
                                this.currentState = States.ERROR
                                warn(`Problem getting snapshot: ${err.toString()}`)
                                debug(err)
                                this.retrySetState(newState)
                            }
                            this.updating = false
                            return
                        }
                    }
                    if (updateSettings) {
                        this.currentSettings = await this.httpClient.getSettings()
                    }
                    if (this.currentSnapshot?.id) {
                        try {
                            await this.saveProject()
                            let optimisticState = States.STOPPED
                            let performStart = true
                            this.currentState = States.UPDATING
                            if (this.targetState === States.SUSPENDED) {
                                this.printAgentStatus('Applying new settings...')
                                performStart = false
                                optimisticState = States.SUSPENDED
                            } else if (this.targetState === States.RUNNING) {
                                this.printAgentStatus('Launching with new settings...')
                                optimisticState = States.STARTING
                            }
                            this.launcher = Launcher.newLauncher(this, this.currentApplication, this.currentProject, this.currentSnapshot, this.currentSettings, this.currentMode)
                            await this.launcher.writeConfiguration({ updateSnapshot, updateSettings })
                            if (performStart) {
                                await this.launcher?.start()
                            } else {
                                this.launcher = undefined
                            }

                            if (this.mqttClient) {
                                this.mqttClient.setProject(this.currentProject)
                                this.mqttClient.setApplication(this.currentApplication)
                                if (developerMode && this.editorToken && this.launcher) {
                                    this.mqttClient.startTunnel(this.editorToken, this.editorAffinity)
                                }
                            }
                            this.currentState = optimisticState
                            this.checkIn(2)
                        } catch (err) {
                            warn(`Error whilst starting Node-RED: ${err.toString()}`)
                            if (this.launcher) {
                                await this.launcher.stop(true, States.ERROR)
                            }
                            this.launcher = undefined
                            this.currentState = States.ERROR
                            this.queuedUpdate = null // we are in error state, clear any queued updates, halt!
                        }
                    }
                }
            }
            if (!this.launcher) {
                if (this.targetState === States.SUSPENDED) {
                    this.currentState = States.SUSPENDED
                } else if (isValidState(this.currentState) === false) {
                    this.currentState = States.STOPPED
                }
            } else {
                this.currentState = this.launcher?.state || States.RUNNING
            }
        } finally {
            this.updating = false
            if (this.queuedUpdate) {
                const update = this.queuedUpdate
                this.queuedUpdate = null
                this.setState(update).catch(err => {
                    this.updating = false
                    warn(`Error whilst processing queued update: ${err.toString()}`)
                    debug(err)
                })
            }
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

    /**
     * Schedule a retry of setState
     *
     * NOTES:
     *   *  Subsequent calls made while timing down will overwrite previous state an restart the timer
     *   *  While the retry is busy executing, any calls to this function will be ignored / discarded
     * @param {Object|false} state - newState data to use. If `false`, stop the timer
     * @param {Number} time - time, in ms, to wait before retrying
     */
    retrySetState (state) {
        // Is this a request to stop/clear timer?
        if (state === false) {
            this.retrySetStateTimer.stop()
            return
        }

        // if busy actually running callback, leave it to finish & discard this request
        if (this.retrySetStateTimer.isExecuting) {
            return
        }

        // ensure timer is stopped
        if (this.retrySetStateTimer.isRunning) {
            this.retrySetStateTimer.stop()
        }

        // setup intervals and jitter:
        // * awaitCallback: true - wait for the callback to run before scheduling another attempt
        //    i.e. compound the executions to cater for maximum jitter/execution time and avoid re-entry/overlap
        // * 1st retry  1~6s
        // * 2nd retry  20~30s
        // * 3rd retry  40~60s
        // * 4th retry  60~90s
        // * subsequent 5m~5.5m
        const intervals = [1000, 20000, 40000, 60000, 300000] // retries at 1s, 20s, 40s, 60s then every 5m
        const jitters = [5000, 10000, 20000, 30000] // jitters at 5s, 10s, 20s, then 30s for all future executions

        // start retry timer
        this.retrySetStateTimer.start({ interval: intervals, jitter: jitters, awaitCallback: true }, async (_timeSinceLastExecution, callCount) => {
            info(`Update state retry attempt #${callCount}`)
            try {
                await this.setState({ ...state })
            } catch (err) {
                warn(`Error whilst retrying state update: ${err.toString()}`)
                debug(err)
            }
        })
    }

    async saveEditorToken (token, affinity) {
        const changed = (this.editorToken !== token || this.editorAffinity !== affinity)
        this.editorToken = token
        this.editorAffinity = affinity
        if (changed) {
            await this.saveProject()
        }
    }
}

module.exports = {
    newAgent: (config) => new Agent(config),
    Agent
}
