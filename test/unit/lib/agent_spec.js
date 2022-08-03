const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const { existsSync } = require('fs')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')

const { Agent } = require('../../../lib/agent')
const httpClient = require('../../../lib/http')
const mqttClient = require('../../../lib/mqtt')
const launcher = require('../../../lib/launcher.js')

describe('Agent', function () {
    let configDir

    function createHTTPAgent () {
        return Agent({
            dir: configDir,
            forgeURL: 'http://localhost:9000'
        })
    }

    function createMQTTAgent () {
        return Agent({
            dir: configDir,
            forgeURL: 'http://localhost:9000',
            brokerURL: 'ws://localhost:9001',
            brokerUsername: 'user',
            brokerPassword: 'pass'
        })
    }
    async function writeConfig (agent, project, snapshot, settings) {
        await fs.writeFile(agent.projectFilePath, JSON.stringify({
            snapshot: { id: snapshot },
            settings: { hash: settings },
            project
        }))
    }

    async function validateConfig (agent, project, snapshot, settings) {
        const config = JSON.parse(await fs.readFile(agent.projectFilePath, { encoding: 'utf-8' }))
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
    }

    beforeEach(async function () {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        sinon.stub(httpClient, 'HTTPClient').returns({
            startPolling: sinon.stub(),
            stopPolling: sinon.stub(),
            getSettings: sinon.stub(),
            getSnapshot: sinon.stub()
        })
        sinon.stub(mqttClient, 'MQTTClient').returns({
            start: sinon.stub(),
            stop: sinon.stub(),
            setProject: sinon.stub()
        })
        sinon.stub(launcher, 'Launcher').callsFake((config, project, settings) => {
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
        })
    })

    describe('start', function () {
        it('uses http polling if no broker config', async function () {
            const agent = createHTTPAgent()
            agent.should.have.property('currentState', 'unknown')
            await agent.start()
            agent.should.have.property('currentState', 'stopped')
            agent.should.not.have.property('mqttClient')
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
            agent.should.have.property('mqttClient')
            agent.mqttClient.start.callCount.should.equal(1)
            agent.mqttClient.setProject.callCount.should.equal(1)
            agent.mqttClient.setProject.firstCall.calledWith('projectId').should.be.true()
        })
    })

    describe('stop', function () {
        it('stops the agent and all components - http only', async function () {
            const agent = createHTTPAgent()
            agent.launcher = launcher.Launcher()
            agent.httpClient.stopPolling.callCount.should.equal(0)
            await agent.start()
            await agent.stop()
            agent.httpClient.stopPolling.callCount.should.equal(1)
            agent.launcher.stop.callCount.should.equal(1)
        })
        it('stops the agent and all components - mqtt enabled', async function () {
            const agent = createMQTTAgent()
            agent.launcher = launcher.Launcher()
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
            state.should.have.property('project', null)
            state.should.have.property('snapshot', null)
            state.should.have.property('settings', null)
            state.should.have.property('state', 'unknown')
        })

        it('returns full state', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            agent.launcher = { state: 'running' }
            const state = agent.getState()

            state.should.have.property('project', 'projectId')
            state.should.have.property('snapshot', 'snapshotId')
            state.should.have.property('settings', 'settingsId')
            state.should.have.property('state', 'running')
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
            validateConfig(agent, null, null, null)
            // Agent was stopped
            agent.stop.callCount.should.equal(1)
            agent.updating.should.be.false()
        })
        it('clears snapshot state if null snapshot passed in', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = { hash: 'settingsId' }
            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            await writeConfig(agent, 'projectId', 'snapshotId', 'settingsId')

            await agent.setState({ snapshot: null })

            agent.currentState.should.equal('stopped')
            // Saved config still includes project
            validateConfig(agent, 'projectId', null, 'settingsId')
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
            validateConfig(agent, 'projectId', null, null)
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

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            validateConfig(agent, 'newProject', 'newSnapshotId', 'newSettingsId')

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

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                project: 'newProject',
                settings: 'newSettingsId',
                snapshot: 'newSnapshotId'
            })
            validateConfig(agent, 'newProject', 'newSnapshotId', 'newSettingsId')

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

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ })

            await agent.setState({
                snapshot: null
            })
            // Saved config still includes project
            validateConfig(agent, 'newProject', null, 'settingsId')

            testLauncher.stop.called.should.be.true()
            should.not.exist(agent.launcher)
        })

        it('Updates when settings changed (null -> newSettingsId)', async function () {
            const agent = createHTTPAgent()
            agent.currentProject = 'projectId'
            agent.currentSnapshot = { id: 'snapshotId' }
            agent.currentSettings = null

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            validateConfig(agent, 'newProject', 'snapshotId', 'newSettingsId')

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

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'newSettingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'should-not-be-called' })

            await agent.setState({
                settings: 'newSettingsId'
            })
            validateConfig(agent, 'newProject', 'snapshotId', 'newSettingsId')

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
            validateConfig(agent, 'newProject', 'newSnapshotId', 'settingsId')
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

            const testLauncher = launcher.Launcher()
            agent.launcher = testLauncher
            agent.httpClient.getSettings.resolves({ hash: 'settingsId' })
            agent.httpClient.getSnapshot.resolves({ id: 'newSnapshotId' })

            await agent.setState({
                snapshot: 'newSnapshotId'
            })
            validateConfig(agent, 'newProject', 'newSnapshotId', 'settingsId')
            should.exist(agent.launcher)
            agent.launcher.writeConfiguration.called.should.be.true()
            agent.launcher.start.called.should.be.true()
            agent.httpClient.getSettings.called.should.be.false()
        })
    })
})
