// set NODE_ENV to test so that the main app doesn't start automatically
process.env.NODE_ENV = 'test'
const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const http = require('http')
const { AgentManager } = require('../../../lib/AgentManager')
const { WebServer } = require('../../../frontend/server')
const App = require('../../../index.js')

describe('Device Agent Web Server', () => {
    /** @type {string} the config directory for the agent */
    let configDir
    /** @type {App[]} */
    const allApps = [] // used to track all apps so they can be cleaned up at the end of the test run

    beforeEach(async function () {
        // stub the console logging so that we don't get console output
        sinon.stub(console, 'log').callsFake((..._args) => {})
        sinon.stub(console, 'info').callsFake((..._args) => {})
        sinon.stub(console, 'warn').callsFake((..._args) => {})
        sinon.stub(console, 'debug').callsFake((..._args) => {})
        sinon.stub(console, 'error').callsFake((..._args) => {})

        process.argv = process.argv.slice(0, 2)
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        process.argv.push('--dir', configDir)
        process.argv.push('--config', 'device.yml')

        await fs.mkdir(path.join(configDir, 'project'))
        sinon.stub(AgentManager, 'startAgent').resolves()
        // spy on the class methods WebServer.start & initialize
        sinon.spy(WebServer.prototype, 'initialize')
        sinon.spy(WebServer.prototype, 'start')

        // mock node:http.createServer prototype so it doesn't actually start a server
        sinon.stub(http, 'createServer').returns({
            on: sinon.stub(),
            listen: sinon.stub().yields(null, { port: 1879 }),
            close: sinon.stub().yields(null),
            address: sinon.stub().returns({ port: 1879 }),
            dummy: sinon.stub().returns('for ensuring the sandbox is used once')
        })
        http.createServer().dummy() // ensure the sandbox is used once.
    })
    afterEach(async function () {
        await fs.rm(configDir, { recursive: true, force: true })
        // http.createServer.reset()
        sinon.restore()
    })

    /**
     * Starts the app with the specified CLI args
     * @param {Array<String[]>} args - an array of arrays, each containing a single or pair of CLI args
     * @returns App
     */
    function startApp (args, options = {}) {
        process.argv = process.argv.slice(0, 2)
        for (const arg of args) {
            process.argv.push(...arg)
        }
        const app = App.main(options)
        allApps.push(app)
        return app
    }

    after(async function () {
        for (let index = 0; index < allApps.length; index++) {
            const app = allApps[index]
            await app?.AgentManager?.close()
            await app?.webServer?.stop()
            allApps[index] = null
        }
        allApps.length = 0
    })

    async function writeAppConfig (workingDir, project, snapshot, settings, mode) {
        const filepath = path.join(workingDir, 'flowfuse-instance.json')
        await fs.writeFile(filepath, JSON.stringify({
            snapshot: { id: snapshot },
            settings: { hash: settings },
            project,
            mode
        }))
    }
    it('by default, Web UI is not enabled', async () => {
        http.createServer.reset()
        const app = startApp([
            ['--dir', configDir],
            ['--config', 'device-wont-exist.yml']
        ])
        // check the CLI flag - should be false
        app.options.ui.should.be.false()
        WebServer.prototype.initialize.called.should.be.false()
        WebServer.prototype.start.called.should.be.false()
        http.createServer.called.should.be.false()
        app.webServer.listening.should.be.false()
    })
    it('quits if config is bad AND UI is not enabled', async () => {
        const onExit = sinon.stub()
        await writeAppConfig(configDir, 'projectId', 'snapshotId', 'settingsId', 'developer')
        const deviceFile = path.join(configDir, 'device.yml')
        const deviceYml = 'deviceId: abc123\ntoken: toktok\ncredentialSecret: A53CF37\nforgeURL:'
        await fs.writeFile(deviceFile, deviceYml)

        const app = startApp([
            ['--dir', configDir],
            ['--config', 'device.yml']
        ], { onExit })
        // check the CLI flag - should be false
        app.options.ui.should.be.false()
        // ensure the app exited with an error
        onExit.calledOnceWith(sinon.match(/Config file missing required options:.*forgeURL/s), 9).should.be.true()
    })
    it('quits if config is missing AND UI not enabled', async () => {
        const onExit = sinon.stub()
        const app = startApp([
            ['--dir', configDir],
            ['--config', 'device-wont-exist.yml']
        ], { onExit })
        // check the CLI flag - should be false
        app.options.ui.should.be.false()
        // ensure the app exited with an error
        onExit.calledOnceWith(sinon.match(/No config file found.*device-wont-exist.yml/s), 2).should.be.true()
    })
    it('fails to run web server if user or pass is not specified', async () => {
        const app = startApp([
            ['--ui'],
            ['--ui-user', 'admin']
        ])

        const called1 = http.createServer.called
        http.createServer.reset()
        const called2 = http.createServer.called
        console.log(called1, called2)

        app.options.ui.should.be.true()
        WebServer.prototype.initialize.called.should.be.true()
        WebServer.prototype.start.called.should.be.true()

        // WebServer.prototype.start should have rejected with an error
        WebServer.prototype.start.exceptions.should.have.length(1)
        // start should have thrown an error before calling http.createServer
        http.createServer.called.should.be.false()

        // explicitly call start to ensure the error includes the correct message
        await app.webServer.start().should.be.rejectedWith(/Missing credentials/)
        // explicitly check listening state
        app.webServer.listening.should.be.false()
    })
    it('starts web server if a user and pass are specified', async () => {
        const app = startApp([
            ['--ui'],
            ['--ui-user', 'admin'],
            ['--ui-pass', 'admin']
        ])
        app.options.ui.should.be.true()
        WebServer.prototype.initialize.called.should.be.true()
        WebServer.prototype.start.called.should.be.true()
        http.createServer.called.should.be.true()
        // explicit clean up to permit test runner to exit
        app.AgentManager?.close()
        app.webServer?.stop()
    })

    it('omitted ui CLI options have correct defaults', async () => {
        const app = startApp([])
        app.options.ui.should.be.false()
        app.options.uiPort.should.be.eql(1879)
        app.options.uiHost.should.be.eql('0.0.0.0')
        app.options.uiRuntime.should.be.eql(10)
        app.options.should.not.have.a.property('uiUser')
        app.options.should.not.have.a.property('uiPass')
    })
    it('ui CLI options are set correctly', async () => {
        const app = startApp([
            ['--ui'],
            ['--ui-port', '1234'],
            ['--ui-host', '127.0.0.1'],
            ['--ui-runtime', '5'],
            ['--ui-user', 'admin-is-ma-name'],
            ['--ui-pass', 'admin-is-ma-pass']
        ])
        app.options.ui.should.be.true()
        app.options.uiPort.should.be.eql(1234)
        app.options.uiHost.should.be.eql('127.0.0.1')
        app.options.uiRuntime.should.be.eql(5)
        app.options.uiUser.should.be.eql('admin-is-ma-name')
        app.options.uiPass.should.be.eql('admin-is-ma-pass')
        // explicit clean up to permit test runner to exit
        app.AgentManager?.close()
        app.webServer?.stop()
    })
    it('ui CLI rejects invalid ui-runtime value', async () => {
        const onExit = sinon.stub()
        const app = startApp([
            ['--ui'],
            ['--ui-user', 'admin'],
            ['--ui-pass', 'admin-pass'],
            ['--ui-runtime', 'abc']
        ], { onExit })
        app.options.ui.should.be.true()
        // sleep for 50ms to permit the app to call quit with params
        await new Promise((resolve) => setTimeout(resolve, 50))
        onExit.calledWith('Web UI runtime must be 0 or greater', 2).should.be.true()
        // explicit clean up to permit test runner to exit
        app.AgentManager?.close()
        app.webServer?.stop()
    })
    it('server auto closes after runtime expires', async () => {
        // spy on the class methods WebServer.stop - need to know that it was called
        const wsStopSpy = sinon.spy(WebServer.prototype, 'stop')
        const app = startApp([
            ['--ui'],
            ['--ui-user', 'admin'],
            ['--ui-pass', 'admin-pass'],
            ['--ui-runtime', '0.0014'] // 0.0014 mins = 84ms
        ])
        app.options.ui.should.be.true()
        WebServer.prototype.initialize.called.should.be.true()
        WebServer.prototype.start.called.should.be.true()
        wsStopSpy.called.should.be.false()
        // await 100ms for the server to auto close
        await new Promise((resolve) => setTimeout(resolve, 100))
        wsStopSpy.calledOnce.should.be.true()
    })
})
