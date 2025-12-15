const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const { existsSync } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')

const logger = require('../../../lib/logging/log.js') // ensure we load this first for later stubbing
const utils = require('../../../lib/utils.js') // ensure we load this first for later stubbing
const agent = require('../../../lib/agent')
const httpClient = require('../../../lib/http')
const mqttClient = require('../../../lib/mqtt')
const Launcher = require('../../../lib/launcher.js')

describe('Agent', function () {
    let configDir
    const launcherStopStartMonitor = [] // a log of all launcher.stop/start calls (used to test that the agent stop/starts the launcher)

    function resetLauncherStopStartMonitor () {
        launcherStopStartMonitor.length = 0
    }

    function findInLogs (level, msg) {
        const logs = logger.getBufferedMessages()
        return logs.find(log => log.level === level && log.msg === msg)
    }

    function createProvisioningAgent () {
        return agent.newAgent({
            dir: configDir,
            forgeURL: 'http://localhost:9000',
            provisioningTeam: 'team1',
            provisioningMode: true,
            token: 'token'
        })
    }

    function createHTTPAgent () {
        return agent.newAgent({
            dir: configDir,
            forgeURL: 'http://localhost:9000'
        })
    }

    function createMQTTAgent (opts) {
        opts = opts || {}
        return agent.newAgent({
            ...opts,
            dir: configDir,
            forgeURL: 'http://localhost:9000',
            brokerURL: 'ws://localhost:9001',
            brokerUsername: 'device:device1:team1',
            brokerPassword: 'pass'
        })
    }
    async function writeConfig (
        agent,
        { application, project, snapshot, settings, mode, licensed, editorToken } = { application: null, project: null, snapshot: null, settings: null, mode: null, licensed: null, editorToken: null }
    ) {
        project = project || agent?.currentProject || null
        application = application || agent?.currentApplication || null
        snapshot = snapshot || agent?.currentSnapshot?.id || null
        settings = settings || agent?.currentSettings?.hash || null
        mode = mode || agent?.currentMode || null
        if (typeof licensed !== 'boolean') {
            licensed = typeof agent?.config?.licensed === 'boolean' ? agent.config.licensed : null
        }

        const ownerType = application ? 'application' : (project ? 'project' : null)
        await fs.writeFile(agent.projectFilePath, JSON.stringify({
            snapshot: { id: snapshot },
            settings: { hash: settings },
            project: project || null,
            application: application || null,
            ownerType,
            mode,
            licensed,
            editorToken
        }))
    }

    /**
     * Validate the agent's project file
     * @param {import('../../../lib/agent.js').Agent} agent - the agent to validate
     * @param {Object} options - the options to validate
     * @param {string} options.application - the application id to validate (leave undefined to skip this check)
     * @param {string} options.project - the project id to validate (leave undefined to skip this check)
     * @param {string} options.snapshot - the snapshot id to validate (leave undefined to skip this check)
     * @param {string} options.settings - the settings hash to validate (leave undefined to skip this check)
     * @param {string} options.mode - the mode to validate (leave undefined to skip this check)
     * @param {boolean} options.licensed - the licensed state to validate (leave undefined to skip this check)
     * @returns {Promise<void>} - resolves when validation is complete
     */
    async function validateConfig (agent, options) {
        const config = JSON.parse(await fs.readFile(agent.projectFilePath, { encoding: 'utf-8' }))

        // config should have one of the following: 'project', 'application'
        config.should.have.property('ownerType')
        if (config.ownerType === 'project') {
            config.should.have.property('project')
        } else if (config.ownerType === 'application') {
            config.should.have.property('application')
        }

        if (options.application) {
            config.should.have.property('ownerType', 'application')
            config.should.have.property('application', options.application)
        } else {
            config.should.not.have.property('ownerType', 'application')
            config.should.have.property('application', null)
        }

        if (options.project) {
            config.should.have.property('ownerType', 'project')
            config.should.have.property('project', options.project)
        } else {
            config.should.not.have.property('ownerType', 'project')
            config.should.have.property('project', null)
        }

        config.should.have.property('snapshot')
        if (options.snapshot) {
            config.snapshot.should.have.property('id', options.snapshot)
        } else {
            config.should.have.property('snapshot', null)
        }

        config.should.have.property('settings')
        if (options.settings) {
            config.settings.should.have.property('hash', options.settings)
        } else {
            config.should.have.property('settings', null)
        }

        if (options.mode !== undefined) {
            config.should.have.property('mode', options.mode)
        }

        if (options.licensed !== undefined) {
            config.should.have.property('licensed')
            config.licensed.should.equal(options.licensed)
        }
    }

    beforeEach(async function () {
        logger.initLogger({ verbose: true })
        // stub the console logging so that we don't get console output
        sinon.stub(logger, 'info').callsFake((..._args) => {})
        sinon.stub(logger, 'warn').callsFake((..._args) => {})
        sinon.stub(logger, 'debug').callsFake((..._args) => {})
        sinon.stub(console, 'log').callsFake((..._args) => {})
        sinon.stub(console, 'info').callsFake((..._args) => {})
        sinon.stub(console, 'warn').callsFake((..._args) => {})
        // sinon.stub(console, 'debug').callsFake((..._args) => {})
        sinon.stub(console, 'error').callsFake((..._args) => {})

        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        sinon.stub(httpClient, 'newHTTPClient').returns({
            startPolling: sinon.stub(),
            stopPolling: sinon.stub(),
            getSettings: sinon.stub(),
            getSnapshot: sinon.stub().resolves({ id: 'a-snapshot-id', flows: [], modules: {} }),
            checkIn: sinon.stub()
        })
        sinon.stub(mqttClient, 'newMQTTClient').returns({
            start: sinon.stub(),
            stop: sinon.stub(),
            setProject: sinon.stub(),
            setApplication: sinon.stub(),
            checkIn: sinon.stub(),
            startTunnel: sinon.stub(),
            sendCommandResponse: sinon.stub()
        })

        sinon.stub(Launcher, 'newLauncher').callsFake((agent, application, project, snapshot, settings, mode) => {
            return {
                agent,
                project,
                application,
                snapshot,
                settings,
                mode,
                start: sinon.stub().callsFake(() => {
                    launcherStopStartMonitor.push({ fn: 'start' })
                    return Promise.resolve()
                }),
                stop: sinon.stub().callsFake((clean, reason) => {
                    launcherStopStartMonitor.push({ fn: 'stop', clean, reason })
                    return Promise.resolve()
                }),
                writeConfiguration: sinon.stub().resolves(),
                readPackage: sinon.stub().resolves({ modules: {} }),
                readFlow: sinon.stub().resolves([])
            }
        })
    })

    afterEach(async function () {
        await fs.rm(configDir, { recursive: true, force: true })
        resetLauncherStopStartMonitor()
        sinon.restore()
    })

    describe('loadProject', function () {
        it('handles no project file', async function () {
            const agent = createHTTPAgent()
            await agent.loadProject()
            agent.should.have.property('currentProject', null)
            agent.should.have.property('currentSettings', null)
            agent.should.have.property('currentSnapshot', null)
        })

        it('handles old format project file', async function () {
            const agent = createHTTPAgent()
            await fs.writeFile(agent.projectFilePath, JSON.stringify({
                id: 'snapshotId',
                device: {
                    hash: 'settingsId'
                }
            }))
            await agent.loadProject()
            agent.should.have.property('currentProject', null)
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
        })

        it('loads project file when device is owned by instance', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId' })

            await agent.loadProject()
            agent.should.have.property('currentOwnerType', 'project')
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
            agent.should.have.property('config').and.be.an.Object()
            agent.config.should.have.property('licensed')
        })
        it('loads project file when device is owned by application', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, { application: 'applicationId', snapshot: 'snapshotId', settings: 'settingsId' })

            await agent.loadProject()
            agent.should.have.property('currentOwnerType', 'application')
            agent.should.have.property('currentApplication', 'applicationId')
            agent.should.have.property('currentSettings')
            agent.should.have.property('config').and.be.an.Object()
            agent.config.should.have.property('licensed')
        })
        it('loads project file set for developer mode', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer' })

            await agent.loadProject()
            agent.should.have.property('currentMode', 'developer')
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
        })
        it('loads project file with a tunnel token', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer', editorToken: 'token' })

            await agent.loadProject()
            agent.should.have.property('currentMode', 'developer')
            agent.should.have.property('editorToken', 'token')
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
        })
    })

    describe('saveProject', function () {
        it('saves project', async function () {
            const agent = createHTTPAgent()
            existsSync(agent.projectFilePath).should.be.false()

            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.config = { licensed: true }
            await agent.saveProject()
            existsSync(agent.projectFilePath).should.be.true()
            await agent.loadProject()
            agent.should.have.property('currentOwnerType', 'project')
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
            agent.should.have.property('currentMode')
            should(agent.currentMode).not.eql('developer')
            agent.should.have.property('config').and.be.an.Object()
            agent.config.should.have.property('licensed', true)
        })
        it('saves project set for developer mode', async function () {
            const agent = createHTTPAgent()
            existsSync(agent.projectFilePath).should.be.false()

            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentMode = 'developer'
            agent.editorToken = 'token'
            await agent.saveProject()
            existsSync(agent.projectFilePath).should.be.true()
            await agent.loadProject()
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
            agent.should.have.property('currentMode', 'developer')
            agent.should.have.property('editorToken', 'token')
        })
    })

    describe('start', function () {
        it('uses http polling if no broker config', async function () {
            const agent = createHTTPAgent()
            agent.should.have.property('currentState', 'unknown')
            await agent.start()
            agent.should.have.property('currentState', 'stopped')
            agent.should.have.property('mqttClient').and.be.null()
            agent.httpClient.startPolling.callCount.should.equal(1)
        })
        it('uses mqtt if broker config provided', async function () {
            const agent = createMQTTAgent()
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId' })

            agent.should.have.property('currentState', 'unknown')
            await agent.start()
            agent.httpClient.startPolling.callCount.should.equal(0)
            // In MQTT mode we stay in unknown state until the platform confirms
            // what state we should be in
            agent.should.have.property('currentState', 'unknown')
            agent.should.have.property('mqttClient').and.be.an.Object()
            agent.mqttClient.start.callCount.should.equal(1)
            agent.mqttClient.setProject.callCount.should.equal(1)
            agent.mqttClient.setProject.firstCall.calledWith('projectId').should.be.true()
        })
    })

    describe('stop', function () {
        it('stops the agent and all components - http only', async function () {
            const agent = createHTTPAgent()
            agent.launcher = Launcher.newLauncher()
            agent.httpClient.stopPolling.callCount.should.equal(0)
            await agent.start()
            // reset the call count before stop and check it after
            agent.httpClient.stopPolling.resetHistory()
            await agent.stop()
            agent.httpClient.stopPolling.callCount.should.equal(1)
            // ensure launcher stop was called
            launcherStopStartMonitor.length.should.equal(1)
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'stop', clean: false, reason: 'shutdown' })
            // ensure launcher is cleared
            should(agent.launcher).be.undefined()
        })
        it('stops the agent and all components - mqtt enabled', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            agent.httpClient.stopPolling.callCount.should.equal(0)
            await agent.start()
            // reset the call count before stop and check it after
            agent.httpClient.stopPolling.resetHistory()
            await agent.stop()
            agent.httpClient.stopPolling.callCount.should.equal(1)
            agent.mqttClient.stop.callCount.should.equal(1)
            // ensure launcher stop was called
            launcherStopStartMonitor.length.should.equal(1)
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'stop', clean: false, reason: 'shutdown' })
            // ensure launcher is cleared
            should(agent.launcher).be.undefined()
        })
    })

    describe('actions', function () {
        it('suspends Node-RED', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            await agent.start()
            sinon.spy(agent, 'saveProject')
            await agent.suspendNR()
            launcherStopStartMonitor.length.should.equal(1)
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'stop', clean: false, reason: 'suspended' })
            should(agent.launcher).be.undefined()
            agent.should.have.property('currentState', 'suspended')
            agent.should.have.property('targetState', 'suspended')
            // ensure project is saved (the targetState is persisted to ensure the agent restarts in the target state)
            agent.saveProject.called.should.be.true('saveProject was not called following target state change')
        })
        it('reloads target state as suspended', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            await agent.start()
            await agent.suspendNR()
            await agent.stop()

            const agent2 = createMQTTAgent()
            await agent2.start()
            agent2.should.have.property('targetState', 'suspended')
        })
        it('reloads target state as running', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            await agent.start()
            await agent.suspendNR()
            await agent.stop()
            agent.should.have.property('targetState', 'suspended')

            const agent2 = createMQTTAgent()
            await agent2.startNR() // cause project to be updated
            await agent2.stop()
            agent2.should.have.property('targetState', 'running')

            const agent3 = createMQTTAgent()
            await agent3.start()
            agent3.should.have.property('targetState', 'running')
        })
        it('restarts Node-RED', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            await agent.start()
            // cause the device to start
            await agent.setState({
                project: 'projectId',
                settings: 'settingsId',
                snapshot: 'snapshotId'
            })
            launcherStopStartMonitor.length.should.be.greaterThan(0)
            launcherStopStartMonitor[0].clean.should.be.false()
            // reset monitor before calling restart
            resetLauncherStopStartMonitor()
            await agent.restartNR()
            // stop should be called with clean = false and reason = restart
            launcherStopStartMonitor.length.should.equal(2) // stop followed by start
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'stop', clean: false, reason: 'restarting' })
            launcherStopStartMonitor[1].should.deepEqual({ fn: 'start' })
            should(agent.launcher).be.an.Object()
            agent.should.have.property('currentState', 'running')
            agent.should.have.property('targetState', 'running')
        })
        it('starts Node-RED after suspend', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            sinon.spy(agent, 'saveProject')
            await agent.start()
            // cause the device to start
            await agent.setState({
                project: 'projectId',
                settings: 'settingsId',
                snapshot: 'snapshotId'
            })
            // reset monitor before calling suspend
            resetLauncherStopStartMonitor()

            // suspend it
            await agent.suspendNR()
            launcherStopStartMonitor.length.should.equal(1)
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'stop', clean: false, reason: 'suspended' })
            should(agent.launcher).be.undefined()
            agent.should.have.property('targetState', 'suspended')
            agent.should.have.property('currentState', 'suspended')
            agent.saveProject.called.should.be.true('saveProject was not called following target state change')

            // reset before calling start
            resetLauncherStopStartMonitor()
            agent.saveProject.resetHistory()

            // now start it
            await agent.startNR()
            launcherStopStartMonitor.length.should.equal(1)
            launcherStopStartMonitor[0].should.deepEqual({ fn: 'start' })
            should(agent.launcher).be.an.Object()
            agent.should.have.property('targetState', 'running')
            agent.should.have.property('currentState', 'running')
            agent.saveProject.called.should.be.true('saveProject was not called following target state change')
        })
    })

    describe('getState', function () {
        it('returns partial state', async function () {
            const agent = createHTTPAgent()
            const state = agent.getState()
            state.should.have.property('ownerType', 'none')
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
            state.should.have.property('targetState', 'running')
            state.should.have.property('mode', 'autonomous') // default
            state.should.have.property('licensed')
        })

        it('returns partial state with developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentMode = 'developer'
            const state = agent.getState()
            state.should.have.property('ownerType', 'none')
            state.should.have.property('project', null)
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
            state.should.have.property('targetState', 'running')
            state.should.have.property('mode', 'developer')
            state.should.have.property('licensed')
        })

        it('returns full state of device owned by an instance', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.config = { licensed: true }
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            state.should.have.property('ownerType', 'project')
            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
            state.should.have.property('targetState', 'running')
            state.should.have.property('mode', 'autonomous') // default
            state.should.have.property('licensed', true)
        })

        it('returns full state of device owned by an application', async function () {
            const agent = createHTTPAgent()
            agent.currentApplication = 'applicationId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.config = { licensed: true }
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            state.should.have.property('ownerType', 'application')
            state.should.have.property('application', 'applicationId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
            state.should.have.property('targetState', 'running')
            state.should.have.property('mode', 'autonomous') // default
            state.should.have.property('licensed', true)
        })

        it('returns full state with developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
            state.should.have.property('targetState', 'running')
            state.should.have.property('mode', 'developer')
        })

        it('returns state when suspended', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            await agent.start()
            await agent.suspendNR()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            const state = agent.getState()
            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'suspended')
            state.should.have.property('targetState', 'suspended')
            state.should.have.property('mode', 'developer')
        })

        it('returns null if updating state', async function () {
            const agent = createHTTPAgent()
            agent.updating = true
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            ;(state === null).should.be.true()
        })
        it.skip('return packageList', async function () {
            const agent = createMQTTAgent()
            agent.launcher = Launcher.newLauncher()
            agent.launcher.reportPackages = true
            await agent.start()
            await agent.suspendNR()
            const state = agent.getState()
            // readPackage requires running launcher, but that requires installing packages
            // to read versions from
        })
    })

    describe('setState', function () {
        it('clears all state when null passed in', async function () {
            const agent = createHTTPAgent()
            sinon.spy(agent, 'stop')
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'autonomous'
            agent.config = { licensed: false }
            await writeConfig(agent)

            await agent.setState(null)

            agent.currentState.should.equal('stopped')
            // Config file is empty
            await validateConfig(agent, { licensed: false })
            // Agent was stopped
            agent.stop.callCount.should.equal(1)
            agent.updating.should.be.false()
        })
        it('does not clear state when null passed in if device is in developer mode', async function () {
            const agent = createHTTPAgent()
            sinon.spy(agent, 'stop')
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer' })

            await agent.setState(null) // should NOT clear state as device is in developer mode

            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer' })

            // Agent was NOT stopped
            agent.stop.callCount.should.equal(0)
            agent.updating.should.be.false()
        })
        it('updates licensed state', async function () {
            const agent = createHTTPAgent()
            sinon.spy(agent, 'stop')
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            agent.config = { licensed: true }
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer', licensed: true })
            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer', licensed: true })

            await agent.setState({ licensed: false })

            // As device is in developer mode, other state is not affected but `licensed` state is always updated
            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId', mode: 'developer', licensed: false })

            // Agent was NOT stopped
            agent.stop.callCount.should.equal(0)
            agent.updating.should.be.false()
        })
        it('clears snapshot state if null snapshot passed in', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            await writeConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId' })

            await agent.setState({ snapshot: null })

            agent.currentState.should.equal('stopped')
            // Saved config still includes project
            await validateConfig(agent, { project: 'projectId', snapshot: null, settings: 'settingsId' })
            // Launcher has been stopped
            should.not.exist(agent.launcher)
            testLauncher.stop.callCount.should.equal(1)
            testLauncher.stop.firstCall.calledWith(true).should.be.true()
            agent.updating.should.be.false()
        })
        it('sets project if changed whilst snapshot is null', async function () {
            const agent = createHTTPAgent()
            agent.currentApplication = null
            agent.currentProject = null
            agent.currentSnapshot = null
            agent.currentSettings = null

            await agent.setState({ project: 'projectId', snapshot: null })

            // Saved config still includes project
            await validateConfig(agent, { project: 'projectId', snapshot: null, settings: null })

            // Launcher has been stopped
            should.not.exist(agent.launcher)
            agent.updating.should.be.false()
        })
        it('sets application if changed whilst snapshot is null', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = null
            agent.currentSnapshot = null
            agent.currentSettings = null

            await agent.setState({ application: 'applicationId', snapshot: null })

            // Saved config still includes project
            await validateConfig(agent, { application: 'applicationId', snapshot: null, settings: null })

            // Launcher has been stopped
            should.not.exist(agent.launcher)
            agent.updating.should.be.false()
        })

        it('starts the launcher without update if needed', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            await agent.setState({
                project: 'projectId',
                settings: 'settingsId',
                snapshot: 'snapshotId'
            })
            agent.httpClient.getSettings.called.should.be.false()
            agent.httpClient.getSnapshot.called.should.be.false()
            should.exist(agent.launcher)
            agent.launcher.start.called.should.be.true()
        })

        it('Updates when project changes (projectId -> newProject)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, { project: 'newProject', snapshot: 'newSnapshotId', settings: 'newSettingsId' })

            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
        })

        it('Updates when project changes (null -> newProject)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, { project: 'newProject', snapshot: 'newSnapshotId', settings: 'newSettingsId' })

            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
        })

        it('Updates when snapshot cleared', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ })

            await agent.setState({
                snapshot: null
            })
            // Saved config still includes project
            await validateConfig(agent, { project: 'projectId', snapshot: null, settings: 'settingsId' })

            testLauncher.stop.called.should.be.true()
            should.not.exist(agent.launcher)
        })

        it('Updates when settings changed (null -> newSettingsId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = null

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'newSettingsId' })

            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSnapshot.called.should.be.false()
        })
        it('Updates when settings changed (settingsId -> newSettingsId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'newSettingsId' })

            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSnapshot.called.should.be.false()
        })

        it('Updates when snapshot changed (null -> newSnapshotId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = null
            agent.currentSnapshot = null
            agent.currentSettings = { hash: 'settingsId' }

            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, { project: null, snapshot: 'newSnapshotId', settings: 'settingsId' })

            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSettings.called.should.be.true('getSettings was not called when snapshot changed') // getSettings should be called because platform will have updated settings from the new snapshot (e.g. FF_SNAPSHOT_ID will be different)
        })
        it('Updates when snapshot changed (snapshotId -> newSnapshotId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, { project: 'projectId', snapshot: 'newSnapshotId', settings: 'settingsId' })

            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSettings.called.should.be.true('getSettings was not called when snapshot changed') // getSettings should be called because platform will have updated settings from the new snapshot (e.g. FF_SNAPSHOT_ID will be different)
        })
        it('Does not update when snapshot changed if device is in developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'xxx' })
            agent.httpClient.getSnapshot.resolves({ id: 'xxx' })
            await agent.saveProject()

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            // config should not have changed
            await validateConfig(agent, { project: 'projectId', snapshot: 'snapshotId', settings: 'settingsId' })

            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.false() // no change to config due to being in developer mode
            agent.httpClient.getSettings.called.should.be.false()
            agent.httpClient.getSnapshot.called.should.be.false()
        })

        it('Updates when in developer mode but no local project defined', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = null
            agent.currentSnapshot = null
            agent.currentSettings = null

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId',
                mode: 'developer'

            })
            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
        })
        it('Checks in when switching to developer mode (HTTP)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'autonomous'

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'developer'
            })
            for (let i = 0; i < 30; i++) {
                if (agent.httpClient.checkIn.called) {
                    break
                }
                await new Promise(resolve => setTimeout(resolve, 10))
            }
            // test that checkIn was called with arg 'developer'
            agent.httpClient.checkIn.called.should.be.true('checkIn was not called following switch to developer mode')
        })
        it('Checks in when switching to developer mode (MQTT)', async function () {
            const agent = createMQTTAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'autonomous'

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'developer'
            })
            for (let i = 0; i < 30; i++) {
                if (agent.mqttClient.checkIn.called) {
                    break
                }
                await new Promise(resolve => setTimeout(resolve, 10))
            }
            // test that checkIn was called with arg 'developer'
            agent.mqttClient.checkIn.called.should.be.true('checkIn was not called following switch to developer mode')
        })
        it('Clears editorToken when switching off developer mode', async function () {
            const agent = createMQTTAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            agent.editorToken = 'test-token'

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'autonomous'
            })
            for (let i = 0; i < 30; i++) {
                if (agent.mqttClient.checkIn.called) {
                    break
                }
                await new Promise(resolve => setTimeout(resolve, 10))
            }
            // test that checkIn was called with arg 'developer'
            should(agent.editorToken).be.null()
        })
        it('reloads latest snapshot from platform when switching off developer mode (if snapshot ID changed)', async function () {
            sinon.stub(utils, 'compareNodeRedData').returns(false)
            const flows = [{ id: 'a-node-id', payload: 'i-am-original' }, {}]

            const agent = createMQTTAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'a-snapshot-id', flows }
            agent.currentSettings = { hash: 'settingsId' }
            this.currentState = 'unknown'
            agent.currentMode = 'developer'
            // spy agent.saveProject
            sinon.spy(agent, 'saveProject')
            const testLauncher = Launcher.newLauncher(undefined, null, null, { id: 'a-DIFFERENT-snapshot-id', flows })
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'autonomous'
            })
            agent.httpClient.getSnapshot.called.should.be.true('getSnapshot was not called following switch to autonomous mode')

            // check the logs for appropriate entries
            const infoLogSnapIdChanged = findInLogs('info', 'Local snapshot ID differs from the snapshot on the forge platform')
            const infoLogFlowsChanged = findInLogs('info', 'Local flows differ from the snapshot on the forge platform')
            const infoLogEnvVarsChanged = findInLogs('info', 'Local environment variables differ from the snapshot on the forge platform')
            const infoLogSomethingChanged = findInLogs('info', 'Local flows have changed. Restoring current snapshot')
            should(infoLogSnapIdChanged).be.an.Object() // should be logged because the snapshot ID is different
            should(infoLogFlowsChanged).not.be.an.Object() // should not be logged because the flows are the same
            should(infoLogEnvVarsChanged).not.be.an.Object() // should not be logged because the env vars are the same
            should(infoLogSomethingChanged).be.an.Object() // should be logged because _something_ changed and caused a reload

            utils.compareNodeRedData.called.should.be.false('compareNodeRedData was called following switch to autonomous mode') // should be false because the snapshot ID check would have failed and prevented a call to compare flows
            agent.saveProject.called.should.be.true('saveProject was not called following switch to autonomous mode') // always true when switching modes
            testLauncher.readFlow.called.should.be.false('readFlow was called following switch to autonomous mode') // should be false as the snapshot ID check would have failed and prevented a call to readFlow
            agent.launcher.writeConfiguration.called.should.be.true('writeConfiguration was not called following switch to autonomous mode') // true because flows are changed
            testLauncher.stop.called.should.be.true('stop was not called following switch to autonomous mode') // true because flows are changed
            agent.launcher.start.called.should.be.true('start was not called following switch to autonomous mode') // true because flows are changed
            agent.mqttClient.setProject.called.should.be.true('setProject was not called following switch to autonomous mode')
            agent.currentSnapshot.should.have.property('id', 'a-snapshot-id') // stub would have returned `a-snapshot-id`, so snapshot was reloaded
        })
        it('reloads latest snapshot from platform when switching off developer mode (if platform env vars are modified)', async function () {
            sinon.stub(utils, 'compareNodeRedData').returns(false)
            const testFlow = [{ id: 'a-node', wires: [] }, { id: 'b-node', wires: [] }]
            const agent = createMQTTAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'a-snapshot-id', flows: testFlow, env: { FF_SNAPSHOT_NAME: 'snapshot 1' } }
            agent.currentSettings = { hash: 'settingsId' }
            this.currentState = 'unknown'
            agent.currentMode = 'developer'
            // spy agent.saveProject
            sinon.spy(agent, 'saveProject')
            sinon.replace(agent.httpClient, 'getSnapshot', sinon.fake(() => {
                return agent.currentSnapshot
            }))
            const launcherLocalSnapshot = { id: 'a-snapshot-id', flows: testFlow, env: { FF_SNAPSHOT_NAME: 'snapshot 2' } } // different env vars
            const testLauncher = Launcher.newLauncher(undefined, null, null, launcherLocalSnapshot, agent.currentSettings)
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'autonomous'
            })
            agent.httpClient.getSnapshot.called.should.be.true('getSnapshot was not called following switch to autonomous mode')

            // check the logs for appropriate entries
            const infoLogSnapIdChanged = findInLogs('info', 'Local snapshot ID differs from the snapshot on the forge platform')
            const infoLogFlowsChanged = findInLogs('info', 'Local flows differ from the snapshot on the forge platform')
            const infoLogEnvVarsChanged = findInLogs('info', 'Local environment variables differ from the snapshot on the forge platform')
            const infoLogSomethingChanged = findInLogs('info', 'Local flows have changed. Restoring current snapshot')
            should(infoLogSnapIdChanged).not.be.an.Object() // should not be logged because the snapshot ID is the same
            should(infoLogFlowsChanged).not.be.an.Object() // should not be logged because the flows are the same
            should(infoLogEnvVarsChanged).be.an.Object() // should be logged because the env vars are different
            should(infoLogSomethingChanged).be.an.Object() // should be logged because _something_ changed and caused a reload

            utils.compareNodeRedData.called.should.be.false('compareNodeRedData was called following switch to autonomous mode') // should be false because the env check would have inhibited a call to compare flows
            testLauncher.readFlow.called.should.be.false('readFlow was called following switch to autonomous mode') // should be false as the env var check would have failed and prevented a call to readFlow
            agent.saveProject.called.should.be.true('saveProject was not called following switch to autonomous mode') // always true when switching modes
            agent.launcher.writeConfiguration.called.should.be.true('writeConfiguration was not called following switch to autonomous mode') // true because flows are changed
            testLauncher.stop.called.should.be.true('stop was not called following switch to autonomous mode') // true because flows are changed
            agent.launcher.start.called.should.be.true('start was not called following switch to autonomous mode') // true because flows are changed
            agent.mqttClient.setProject.called.should.be.true('setProject was not called following switch to autonomous mode')
            agent.currentSnapshot.should.have.property('id', 'a-snapshot-id') // stub would have returned `a-snapshot-id`, so snapshot was reloaded
        })
        it('reloads latest snapshot from platform when switching off developer mode (if flows modified)', async function () {
            sinon.stub(utils, 'compareNodeRedData').returns(false)
            const flows1 = [{ id: 'a-node-id', payload: 'i-am-original' }, {}]
            const flows2 = [{ id: 'a-node-id', payload: 'i-am-different' }, {}]

            const agent = createMQTTAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'a-snapshot-id', flows: flows1 }
            agent.currentSettings = { hash: 'settingsId' }
            this.currentState = 'unknown'
            agent.currentMode = 'developer'
            // spy agent.saveProject
            sinon.spy(agent, 'saveProject')
            const testLauncher = Launcher.newLauncher(undefined, null, null, { id: 'a-snapshot-id', flows: flows2 })
            sinon.replace(testLauncher, 'readFlow', sinon.fake(() => {
                return flows2
            }))
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'autonomous'
            })
            agent.httpClient.getSnapshot.called.should.be.true('getSnapshot was not called following switch to autonomous mode')

            // check the logs for appropriate entries
            const infoLogSnapIdChanged = findInLogs('info', 'Local snapshot ID differs from the snapshot on the forge platform')
            const infoLogFlowsChanged = findInLogs('info', 'Local flows differ from the snapshot on the forge platform')
            const infoLogEnvVarsChanged = findInLogs('info', 'Local environment variables differ from the snapshot on the forge platform')
            const infoLogSomethingChanged = findInLogs('info', 'Local flows have changed. Restoring current snapshot')
            should(infoLogSnapIdChanged).not.be.an.Object() // should not be logged because the snapshot ID is the same
            should(infoLogFlowsChanged).be.an.Object() // should be logged because the flows are different
            should(infoLogEnvVarsChanged).not.be.an.Object() // should not be logged because the env vars are the same
            should(infoLogSomethingChanged).be.an.Object() // should be logged because _something_ changed and caused a reload

            utils.compareNodeRedData.called.should.be.true('compareNodeRedData was not called following switch to autonomous mode')
            agent.saveProject.called.should.be.true('saveProject was not called following switch to autonomous mode') // always true when switching modes
            testLauncher.readFlow.called.should.be.true('readFlow was not called following switch to autonomous mode') // true because flows are changed
            agent.launcher.writeConfiguration.called.should.be.true('writeConfiguration was not called following switch to autonomous mode') // true because flows are changed
            testLauncher.stop.called.should.be.true('stop was not called following switch to autonomous mode') // true because flows are changed
            agent.launcher.start.called.should.be.true('start was not called following switch to autonomous mode') // true because flows are changed
            agent.mqttClient.setProject.called.should.be.true('setProject was not called following switch to autonomous mode')
            agent.currentSnapshot.should.have.property('id', 'a-snapshot-id') // stub would have returned `a-snapshot-id`, so snapshot was reloaded
        })
        it('does not reload latest snapshot from platform when switching off developer mode (if flows are unchanged)', async function () {
            sinon.stub(utils, 'compareNodeRedData').returns(true)
            const agent = createMQTTAgent()
            sinon.spy(agent, 'saveProject')
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'original-snapshot-id', flows: [] }
            agent.currentSettings = { hash: 'settingsId' }
            this.currentState = 'unknown'
            agent.currentMode = 'developer'

            const testLauncher = Launcher.newLauncher(agent.config, null, agent.currentProject, agent.currentSnapshot, agent.currentSettings, agent.currentMode)
            sinon.replace(agent.httpClient, 'getSnapshot', sinon.fake(() => {
                return agent.currentSnapshot
            }))
            agent.launcher = testLauncher
            await agent.start()
            await agent.setState({
                mode: 'autonomous'
            })
            agent.httpClient.getSnapshot.called.should.be.true('getSnapshot was not called following switch to autonomous mode')

            // check the logs for appropriate entries
            const infoLogSnapIdChanged = findInLogs('info', 'Local snapshot ID differs from the snapshot on the forge platform')
            const infoLogFlowsChanged = findInLogs('info', 'Local flows differ from the snapshot on the forge platform')
            const infoLogEnvVarsChanged = findInLogs('info', 'Local environment variables differ from the snapshot on the forge platform')
            const infoLogSomethingChanged = findInLogs('info', 'Local flows have changed. Restoring current snapshot')
            should(infoLogSnapIdChanged).not.be.an.Object() // should not be logged (nothing changed)
            should(infoLogFlowsChanged).not.be.an.Object() // should not be logged (nothing changed)
            should(infoLogEnvVarsChanged).not.be.an.Object() // should not be logged (nothing changed)
            should(infoLogSomethingChanged).not.be.an.Object() // should not be logged (nothing changed)

            utils.compareNodeRedData.called.should.be.true('compareNodeRedData was not called following switch to autonomous mode') // true because flows are unchanged
            agent.saveProject.called.should.be.true('saveProject was not called following switch to autonomous mode') // true because change of mode should trigger saveProject
            testLauncher.stop.called.should.be.false('stop was called following switch to autonomous mode') // false because flows are unchanged
            agent.launcher.writeConfiguration.called.should.be.false('writeConfiguration was called following switch to autonomous mode') // false because flows are unchanged
            agent.launcher.start.called.should.be.false('start was called following switch to autonomous mode') // false because flows are unchanged
            agent.currentSnapshot.should.have.property('id', 'original-snapshot-id') // stub would have returned `a-snapshot-id`, so no change to snapshot
        })
        it('Updates when nr-assistant is required but settings does not yet have assistant configuration', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId', modules: { '@flowfuse/nr-assistant': '0.1.0' } }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId', assistant: { enabled: true } })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            Launcher.newLauncher.resetHistory()
            await agent.setState({
                settings: 'settingsId'
            })

            // Launcher should be stopped and a new one created with assistant enabled
            Launcher.newLauncher.called.should.be.true('newLauncher was not called when assistant configuration was missing')
            Launcher.newLauncher.lastCall.args[4].should.have.property('assistant', { enabled: true })
            agent.httpClient.getSettings.called.should.be.true('getSettings was not called when assistant configuration was missing')
            agent.currentSettings.should.have.property('assistant', { enabled: true })
            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSnapshot.called.should.be.false()
            // check the logs for appropriate entries
            should(findInLogs('info', 'Assistant settings not found')).be.an.Object()
            should(findInLogs('info', 'Launching with new settings...')).be.an.Object()
        })
        it('Does not update settings when nr-assistant is required and settings already has assistant configuration', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentApplication = null
            agent.currentSnapshot = { id: 'snapshotId', modules: { '@flowfuse/nr-assistant': '0.1.0' } }
            agent.currentSettings = { hash: 'settingsId', assistant: {} }

            const testLauncher = Launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId', assistant: { enabled: true } })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            Launcher.newLauncher.resetHistory()
            await agent.setState({
                settings: 'settingsId'
            })

            // getSettings should not be called when assistant configuration is present
            agent.httpClient.getSettings.called.should.be.false('getSettings was called when assistant configuration was present')
            agent.httpClient.getSnapshot.called.should.be.false()
            // check the logs for appropriate entries
            should(findInLogs('info', 'Assistant settings not found')).be.undefined()
        })
    })

    describe('provisioning', function () {
        it('Starts the agent in provisioning mode', async function () {
            const agent = createProvisioningAgent()
            agent.httpClient.getSettings.resolves({ })
            agent.httpClient.getSnapshot.resolves({ })
            await agent.start()
            agent.should.have.property('currentState', 'provisioning')
            agent.httpClient.startPolling.called.should.be.true()
            should.not.exist(agent.launcher)
            agent.should.have.property('currentProject', null)
            agent.should.have.property('currentSnapshot', null)
            agent.should.have.property('currentSettings', null)
        })
        it('Downloads new credentials and starts the launcher', async function () {
            this.skip() // TODO: Implement this test
            // const agent = createProvisioningAgent()
            // agent.httpClient.getSettings.resolves({ })
            // agent.httpClient.getSnapshot.resolves({ })
            // await agent.start()
            // validateConfig(agent, 'newProject', 'newSnapshotId', 'settingsId')
            // should.exist(agent.launcher)
            // agent.launcher.writeConfiguration.called.should.be.true()
            // agent.launcher.start.called.should.be.true()
            // agent.httpClient.getSettings.called.should.be.false()
        })
    })
    describe('developer mode', function () {
        it('Starts the agent in developer mode', async function () {
            const agent = createMQTTAgent()
            agent.currentMode = 'developer'
            await agent.saveProject() // generate a project file with developer mode

            const agent2 = createMQTTAgent() // load the project file
            await agent2.loadProject()
            const state = agent2.getState()
            state.should.have.property('project', null)
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
            state.should.have.property('mode', 'developer')
        })
        describe('editor tunnel', function () {
            it('reconnects tunnel in developer mode when editorToken is set', async function () {
                // Create a temporary agent and set project, snapshot and settings IDs etc
                // so that the agent will have the necessary properties to "start" the launcher
                // and thus attempt to re-open the tunnel
                // This is purely to generate config file with the necessary properties set
                const agent = createMQTTAgent()
                agent.currentMode = 'developer'
                agent.editorToken = 'token'
                agent.project = 'projectId'
                agent.snapshot = 'snapshotId'
                agent.settings = 'settingsId'
                agent.currentSnapshot = { id: 'snapshotId' }
                await agent.saveProject()

                // Create a new agent and load the project file created above
                const agent2 = createMQTTAgent()
                await agent2.loadProject()
                await agent2.start()

                // fake a check-in what will start the launcher and the attempt to start the tunnel
                const state = agent2.getState()
                await agent2.setState(state)

                // fail safe this test by checking the launcher was created and start was called
                // also, that the mqtt client was created and start was called
                agent2.should.have.property('launcher').and.be.an.Object()
                agent2.should.have.property('mqttClient').and.be.an.Object()
                agent2.launcher.start.callCount.should.equal(1)
                agent2.mqttClient.start.callCount.should.equal(1)

                // check that the tunnel is started with the correct token (arg0)
                // NOTE: since this is not an MQTT commanded execution, 2nd arg should NOT be present
                //       and therefore sendCommandResponse should NOT be called
                agent2.mqttClient.startTunnel.callCount.should.equal(1)
                agent2.mqttClient.startTunnel.firstCall.calledWith('token').should.be.true()
                should.not.exist(agent2.mqttClient.startTunnel.firstCall.args[1])
                agent2.mqttClient.sendCommandResponse.callCount.should.equal(0) // since this was not an MQTT commanded execution, no response should be sent
            })
            it('does not attempt to reconnect tunnel if not in developer mode (even if editorToken is set)', async function () {
                // Create a temporary agent and set project, snapshot and settings IDs etc
                // so that the agent will have the necessary properties to "start" the launcher
                // and thus attempt to re-open the tunnel (but only in developer mode)
                // This is purely to generate config file with the necessary properties set
                const agent = createMQTTAgent()
                agent.currentMode = 'autonomous' // not developer mode this time
                agent.editorToken = 'token'
                agent.project = 'projectId'
                agent.snapshot = 'snapshotId'
                agent.settings = 'settingsId'
                agent.currentSnapshot = { id: 'snapshotId' }
                await agent.saveProject()

                // Create a new agent and load the project file created above
                const agent2 = createMQTTAgent()
                await agent2.loadProject()
                await agent2.start()

                // fake a check-in what will start the launcher
                const state = agent2.getState()
                await agent2.setState(state)

                // fail safe this test by checking the launcher was created and start was called
                // also, that the mqtt client was created and start was called
                agent2.should.have.property('launcher').and.be.an.Object()
                agent2.should.have.property('mqttClient').and.be.an.Object()
                agent2.launcher.start.callCount.should.equal(1)
                agent2.mqttClient.start.callCount.should.equal(1)

                // now ensure that the tunnel was NOT started
                agent2.mqttClient.startTunnel.callCount.should.equal(0)
                agent2.mqttClient.sendCommandResponse.callCount.should.equal(0)
            })
        })
    })
})
