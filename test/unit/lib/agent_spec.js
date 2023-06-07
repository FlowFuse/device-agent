const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const { existsSync } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')

const agent = require('../../../lib/agent')
const httpClient = require('../../../lib/http')
const mqttClient = require('../../../lib/mqtt')
const launcher = require('../../../lib/launcher.js')

describe('Agent', function () {
    let configDir

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
    async function writeConfig (agent, project, snapshot, settings, mode) {
        await fs.writeFile(agent.projectFilePath, JSON.stringify({
            snapshot: { id: snapshot },
            settings: { hash: settings },
            project,
            mode
        }))
    }

    async function validateConfig (agent, project, snapshot, settings, mode) {
        console.log('validateConfig().  agent.projectFilePath: ', agent.projectFilePath)
        const config = JSON.parse(await fs.readFile(agent.projectFilePath, { encoding: 'utf-8' }))
        console.log('validateConfig().  config: ', config)
        config.should.have.property('project', project)
        config.should.have.property('snapshot')
        if (snapshot !== null) {
            config.snapshot.should.have.property('id', snapshot)
        } else {
            config.should.have.property('snapshot', null)
        }
        config.should.have.property('settings')
        if (settings !== null) {
            config.settings.should.have.property('hash', settings)
        } else {
            config.should.have.property('settings', null)
        }
        if (arguments.length > 4) {
            config.should.have.property('mode', mode)
        }
    }

    beforeEach(async function () {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        sinon.stub(httpClient, 'newHTTPClient').returns({
            startPolling: sinon.stub(),
            stopPolling: sinon.stub(),
            getSettings: sinon.stub(),
            getSnapshot: sinon.stub()
        })
        sinon.stub(mqttClient, 'newMQTTClient').returns({
            start: sinon.stub(),
            stop: sinon.stub(),
            setProject: sinon.stub()
        })
        sinon.stub(launcher, 'newLauncher').callsFake((config, project, settings) => {
            return {
                start: sinon.stub().resolves(),
                stop: sinon.stub().resolves(),
                writeConfiguration: sinon.stub().resolves()
            }
        })
    })

    afterEach(async function () {
        await fs.rm(configDir, { recursive: true, force: true })
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

        it('loads project file', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId')

            await agent.loadProject()
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
        })
        it('loads project file set for developer mode', async function () {
            const agent = createHTTPAgent()
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId', 'developer')

            await agent.loadProject()
            agent.should.have.property('currentMode', 'developer')
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
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentSnapshot = { id: 'snapshotId' }
            await agent.saveProject()
            existsSync(agent.projectFilePath).should.be.true()
            await agent.loadProject()
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
            agent.should.have.property('currentMode')
            should(agent.currentMode).not.eql('developer')
        })
        it('saves project set for developer mode', async function () {
            const agent = createHTTPAgent()
            existsSync(agent.projectFilePath).should.be.false()

            agent.currentProject = 'projectId'
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentMode = 'developer'
            await agent.saveProject()
            existsSync(agent.projectFilePath).should.be.true()
            await agent.loadProject()
            agent.should.have.property('currentProject', 'projectId')
            agent.should.have.property('currentSettings')
            agent.currentSettings.should.have.property('hash', 'settingsId')
            agent.should.have.property('currentSnapshot')
            agent.currentSnapshot.should.have.property('id', 'snapshotId')
            agent.should.have.property('currentMode', 'developer')
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
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId')

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
            agent.launcher = launcher.newLauncher()
            agent.httpClient.stopPolling.callCount.should.equal(0)
            await agent.start()
            await agent.stop()
            agent.httpClient.stopPolling.callCount.should.equal(1)
            agent.launcher.stop.callCount.should.equal(1)
        })
        it('stops the agent and all components - mqtt enabled', async function () {
            const agent = createMQTTAgent()
            agent.launcher = launcher.newLauncher()
            agent.httpClient.stopPolling.callCount.should.equal(0)
            await agent.start()
            await agent.stop()
            agent.httpClient.stopPolling.callCount.should.equal(1)
            agent.mqttClient.stop.callCount.should.equal(1)
            agent.launcher.stop.callCount.should.equal(1)
        })
    })

    describe('getState', function () {
        it('returns partial state', async function () {
            const agent = createHTTPAgent()
            const state = agent.getState()
            console.log(state)
            state.should.have.property('project', null)
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
            state.should.have.property('mode', 'autonomous') // default
        })

        it('returns partial state with developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentMode = 'developer'
            const state = agent.getState()
            console.log(state)
            state.should.have.property('project', null)
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
            state.should.have.property('mode', 'developer')
        })

        it('returns full state', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            console.log(state)

            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
            state.should.have.property('mode', 'autonomous') // default
        })

        it('returns full state with developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            console.log(state)

            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
            state.should.have.property('mode', 'developer')
        })

        it('returns null if updating state', async function () {
            const agent = createHTTPAgent()
            agent.updating = true
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.launcher = { state: 'running' }
            const state = agent.getState()
            ;(state === null).should.be.true()
        })
    })

    describe('setState', function () {
        it('clears all state when null passed in', async function () {
            const agent = createHTTPAgent()
            sinon.spy(agent, 'stop')
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId')

            await agent.setState(null)

            agent.currentState.should.equal('stopped')
            // Config file is empty
            await validateConfig(agent, null, null, null)
            // Agent was stopped
            agent.stop.callCount.should.equal(1)
            agent.updating.should.be.false()
        })
        it('does not clear state when null passed in if device is in developer mode', async function () {
            const agent = createHTTPAgent()
            sinon.spy(agent, 'stop')
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId', 'developer')
            await validateConfig(agent, 'projectId', 'snapshotId', 'settingsId', 'developer')

            await agent.setState(null) // should NOT clear state as device is in developer mode

            // agent.currentState.should.equal('running')
            await validateConfig(agent, 'projectId', 'snapshotId', 'settingsId', 'developer')
            // Agent was NOT stopped
            agent.stop.callCount.should.equal(0)
            agent.updating.should.be.false()
        })
        it('clears snapshot state if null snapshot passed in', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId')

            await agent.setState({ snapshot: null })

            agent.currentState.should.equal('stopped')
            // Saved config still includes project
            await validateConfig(agent, 'projectId', null, 'settingsId')
            // Launcher has been stopped
            should.not.exist(agent.launcher)
            testLauncher.stop.callCount.should.equal(1)
            testLauncher.stop.firstCall.calledWith(true).should.be.true()
            agent.updating.should.be.false()
        })
        it('sets project if changed whilst snapshot is null', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = null
            agent.currentSnapshot = null
            agent.currentSettings = null

            await agent.setState({ project: 'projectId', snapshot: null })

            // Saved config still includes project
            await validateConfig(agent, 'projectId', null, null)
            // Launcher has been stopped
            should.not.exist(agent.launcher)
            agent.updating.should.be.false()
        })

        it('starts the launcher without update if needed', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
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
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, 'newProject', 'newSnapshotId', 'newSettingsId')

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

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, 'newProject', 'newSnapshotId', 'newSettingsId')

            testLauncher.stop.called.should.be.true()
            should.exist(agent.launcher)
            agent.launcher.should.not.eql(testLauncher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
        })

        it('Updates when snapshot cleared', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ })

            await agent.setState({
                snapshot: null
            })
            // Saved config still includes project
            await validateConfig(agent, 'projectId', null, 'settingsId')

            testLauncher.stop.called.should.be.true()
            should.not.exist(agent.launcher)
        })

        it('Updates when settings changed (null -> newSettingsId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = null

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            await validateConfig(agent, 'projectId', 'snapshotId', 'newSettingsId')

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
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            await validateConfig(agent, 'projectId', 'snapshotId', 'newSettingsId')

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
            await validateConfig(agent, null, 'newSnapshotId', 'settingsId')
            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSettings.called.should.be.false()
        })
        it('Updates when snapshot changed (snapshotId -> newSnapshotId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            await validateConfig(agent, 'projectId', 'newSnapshotId', 'settingsId')
            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSettings.called.should.be.false()
            agent.httpClient.getSnapshot.called.should.be.true()
        })
        it('Does not update when snapshot changed if device is in developer mode', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.currentMode = 'developer'

            const testLauncher = launcher.newLauncher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'xxx' })
            agent.httpClient.getSnapshot.resolves({ id: 'xxx' })
            await agent.saveProject()

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            // config should not have changed
            await validateConfig(agent, 'projectId', 'snapshotId', 'settingsId')
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

            const testLauncher = launcher.newLauncher()
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
    })
})
