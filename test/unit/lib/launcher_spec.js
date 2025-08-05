const mocha = require('mocha') // eslint-disable-line
const should = require('should')
const sinon = require('sinon')
const childProcess = require('child_process')
const { newLauncher } = require('../../../lib/launcher')
const setup = require('../setup')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')

describe('Launcher', function () {
    this.timeout(15000)

    // logger.initLogger({ verbose: true })
    const config = {
        credentialSecret: 'secret',
        port: 1880,
        dir: '',
        verbose: true
    }

    const configWithPlatformInfo = {
        ...config,
        forgeURL: 'https://test',
        token: 'test-token',
        deviceId: 'deviceid'
    }

    beforeEach(async function () {
        config.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        configWithPlatformInfo.dir = config.dir
        await fs.mkdir(path.join(config.dir, 'project'))

        sinon.replace(childProcess, 'spawn', sinon.fake(() => {
            const callbacks = {}
            return {
                on: (event, cb) => {
                    callbacks[event] = cb
                },
                stdout: { on: (event, cb) => {} },
                stderr: { on: (event, cb) => {} },
                kill: () => {
                    callbacks.exit && callbacks.exit(0)
                },
                unref: () => {}
            }
        }))
    })

    afterEach(async function () {
        try {
            // Force removal of the directory and its contents
            await fs.rm(config.dir, { recursive: true, force: true })
        } catch (err) {
            // If the standard rm fails, try again after a short delay (improves occasional fails on Windows)
            console.debug('Directory removal failed, trying again in a moment')
            await new Promise(resolve => setTimeout(resolve, 100))
            await fs.rm(config.dir, { recursive: true, force: true })
        }
        sinon.restore()
    })

    it('Creates a new launcher instance', async function () {
        const launcher = newLauncher({ config, checkIn: () => {} }, null, 'projectId', setup.snapshot)
        should(launcher).be.an.Object()
        await launcher.writeFlow()
        await launcher.writeCredentials()

        // stub installDependencies so we don't actually install anything when starting
        sinon.stub(launcher, 'installDependencies').resolves()

        await launcher.start() // childProcess.spawn is faked in beforeEach

        // check it spawns with the required settings
        console.log(launcher.proc.spawnargs)
        should(childProcess.spawn.args).be.an.Array().and.have.lengthOf(1)
        should(childProcess.spawn.args[0]).be.an.Array().and.have.lengthOf(3)
        const arg0 = childProcess.spawn.args[0][0]
        should(arg0).be.a.String().and.containEql('node')

        const arg1 = childProcess.spawn.args[0][1]
        should(arg1).be.an.Array() // max_old_space_size, red.js, -u, /path/to/project

        const arg2 = childProcess.spawn.args[0][2]
        should(arg2).be.an.Object()
        arg2.should.have.property('cwd', path.join(config.dir, 'project'))
        arg2.should.have.property('env')
        arg2.env.should.have.property('NODE_PATH')
        arg2.env.NODE_PATH.should.containEql(path.join(config.dir, 'project', 'node_modules'))
        arg2.env.NODE_PATH.should.containEql(path.join(__dirname, '..', '..', '..', 'node_modules'))
        arg2.env.should.have.property('FF_PROJECT_NAME', 'TEST_PROJECT')
        arg2.env.should.have.property('TZ')
        await launcher.stop()
    })

    it('Create Snapshot Flow/Creds Files, instance bound device', async function () {
        const launcher = newLauncher({ config }, null, 'projectId', setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Create Snapshot Flow/Creds Files, application bound device', async function () {
        const launcher = newLauncher({ config }, 'applicationId', null, setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Write Settings - without broker, instance bound device', async function () {
        const launcher = newLauncher({ config }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('projectID', 'PROJECTID')
        settings.flowforge.should.not.have.property('projectLink')
    })
    it('Write Settings - without broker, application bound device', async function () {
        const launcher = newLauncher({ config }, 'APP-ID', null, setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('applicationID', 'APP-ID')
        settings.flowforge.should.not.have.property('projectLink')
    })
    it('Write Settings - with broker', async function () {
        const launcher = newLauncher({
            config: {
                ...config,
                brokerURL: 'BURL',
                brokerUsername: 'BUSER:TEAMID:deviceid',
                brokerPassword: 'BPASS'
            }
        }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('projectID', 'PROJECTID')
        settings.flowforge.should.have.property('projectLink')
        settings.flowforge.should.have.property('teamID', 'TEAMID')
        // by default, since the feature flag is not set, it should be true.
        // This is for backwards compatibility where a Node-RED instance has the nodes in their flows
        // but the feature flag is not present in the settings.
        settings.flowforge.projectLink.should.have.property('featureEnabled', true)
        settings.flowforge.projectLink.should.have.property('broker')
        settings.flowforge.projectLink.broker.should.have.property('url', 'BURL')
        settings.flowforge.projectLink.broker.should.have.property('username', 'BUSER:TEAMID:deviceid')
        settings.flowforge.projectLink.broker.should.have.property('password', 'BPASS')
    })
    it('Write Settings - with broker and feature flag `projectComms` false', async function () {
        const launcher = newLauncher({
            config: {
                ...config,
                brokerURL: 'BURL',
                brokerUsername: 'BUSER:TEAMID:deviceid',
                brokerPassword: 'BPASS'
            }
        }, null, 'PROJECTID', setup.snapshot, { features: { projectComms: false } })
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('projectID', 'PROJECTID')
        settings.flowforge.should.have.property('projectLink')
        settings.flowforge.should.have.property('teamID', 'TEAMID')
        settings.flowforge.projectLink.should.have.property('featureEnabled', false) // explicitly disabled
        settings.flowforge.projectLink.should.have.property('broker')
        settings.flowforge.projectLink.broker.should.have.property('url', '') // should be set to empty string
        settings.flowforge.projectLink.broker.should.have.property('username', '') // should be set to empty string
        settings.flowforge.projectLink.broker.should.have.property('password', '') // should be set to empty string
    })

    it('Write package.json', async function () {
        const launcher = newLauncher({ config }, null, 'projectId', setup.snapshot)
        await launcher.writePackage()
        const pkgFile = await fs.readFile(path.join(config.dir, 'project', 'package.json'))
        const pkg = JSON.parse(pkgFile)
        pkg.dependencies.should.have.property('node-red', '2.2.2')
        pkg.dependencies.should.have.property('node-red-node-random', '0.4.0')
        pkg.name.should.eqls('TEST_PROJECT')
        pkg.version.should.eqls('0.0.0-aaaabbbbcccc')
    })

    it('Updates package.json with user defined Node-RED version', async function () {
        const newSettings = {
            editor: {
                nodeRedVersion: '3.1.9'
            }
        }
        // simulate agent update settings. Essentially, when updated settings are available, the agent will
        // create a new launcher instance then call writeConfiguration with the `updateSettings` flag set to true
        const launcher = newLauncher({ config }, 'application', null, setup.snapshot, newSettings)
        // mock relevant parts of launcher and launcher.agent:
        sinon.spy(launcher, 'writePackage')
        sinon.spy(launcher, 'writeSettings')
        sinon.spy(launcher, 'writeFlow')
        sinon.stub(launcher, 'installDependencies').resolves()
        launcher.agent.currentOwnerType = 'application'

        // simulate agent update settings
        await launcher.writeConfiguration({ updateSettings: true })
        launcher.settings.should.have.property('editor').and.be.an.Object()
        launcher.settings.editor.should.have.property('nodeRedVersion', '3.1.9')
        launcher.writePackage.calledOnce.should.be.true()
        launcher.writeSettings.calledOnce.should.be.true()
        launcher.writeFlow.calledOnce.should.be.true()
        launcher.installDependencies.calledOnce.should.be.true()

        // check written package.json
        const pkgFileAfter = await fs.readFile(path.join(config.dir, 'project', 'package.json'))
        const pkgAfter = JSON.parse(pkgFileAfter)
        pkgAfter.dependencies.should.have.property('node-red', '3.1.9')
    })

    it('Write Settings - with HTTPS, raw values', async function () {
        const launcher = newLauncher({
            config: {
                ...config,
                https: {
                    cert: '123',
                    ca: '456',
                    key: '789'
                }
            }
        }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('https')
    })
    it('Write Settings - with httpStatic', async function () {
        const launcher = newLauncher({
            config: {
                ...config,
                httpStatic: 'static-path'
            }
        }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('httpStatic', 'static-path')
    })
    it('Write .npmrc file', async function () {
        const launcher = newLauncher({ config }, null, 'projectId', setup.snapshot)
        await launcher.writeNPMRCFile()
        const npmrc = await fs.readFile(path.join(config.dir, 'project', '.npmrc'))
        npmrc.toString().should.eql('// test\n')
    })

    it('Uses custom catalogue when licensed', async function () {
        const licensedConfig = {
            ...config,
            licenseType: 'ee',
            licensed: true
        }
        const launcher = newLauncher({ config: licensedConfig }, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('editorTheme')
        settings.editorTheme.should.have.property('palette')
        settings.editorTheme.palette.should.have.a.property('catalogues').and.be.an.Array()
        settings.editorTheme.palette.catalogues.should.have.a.lengthOf(3)
        settings.editorTheme.palette.catalogues[0].should.eql('foo')
        settings.editorTheme.palette.catalogues[1].should.eql('bar')
        settings.editorTheme.palette.catalogues[2].should.eql('baz')
    })
    it('ignores custom catalogue when NOT licensed', async function () {
        const launcher = newLauncher({ config }, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('editorTheme')
        settings.editorTheme.should.have.property('palette')
        settings.editorTheme.palette.should.not.have.a.property('catalogues')
    })
    it('sets up audit logging for the node-red instance', async function () {
        const launcher = newLauncher({ config: configWithPlatformInfo }, null, 'projectId', setup.snapshot)
        const expectedURL = `${configWithPlatformInfo.forgeURL}/logging/device/${configWithPlatformInfo.deviceId}/audit`
        should(launcher).be.an.Object()
        launcher.should.have.property('auditLogURL', expectedURL)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('deviceId', configWithPlatformInfo.deviceId)
        settings.flowforge.should.have.property('auditLogger').and.be.an.Object()
        settings.flowforge.auditLogger.should.have.property('url', expectedURL)
        settings.flowforge.auditLogger.should.have.property('token', configWithPlatformInfo.token)
        settings.flowforge.auditLogger.should.have.property('bin', path.join(__dirname, '..', '..', '..', 'lib', 'auditLogger', 'index.js'))
    })
    it('settings.js loads audit logger with settings from config', async function () {
        const launcher = newLauncher({ config: configWithPlatformInfo }, null, 'projectId', setup.snapshot)
        const expectedURL = `${configWithPlatformInfo.forgeURL}/logging/device/${configWithPlatformInfo.deviceId}/audit`
        await launcher.writeSettings()

        // copy the template-settings as settings.js to the test dir
        await fs.copyFile(path.join(__dirname, '..', '..', '..', 'lib', 'template', 'template-settings.js'), path.join(config.dir, 'project', 'settings.js'))
        const runtimeSettings = require(path.join(config.dir, 'project', 'settings.js'))
        should(runtimeSettings).be.an.Object()
        runtimeSettings.should.have.property('logging').and.be.an.Object()
        runtimeSettings.logging.should.have.property('auditLogger').and.be.an.Object()
        runtimeSettings.logging.auditLogger.should.have.property('level', 'off')
        runtimeSettings.logging.auditLogger.should.have.property('audit', true)
        runtimeSettings.logging.auditLogger.should.have.property('handler').and.be.a.Function()
        runtimeSettings.logging.auditLogger.should.have.property('loggingURL', expectedURL)
        runtimeSettings.logging.auditLogger.should.have.property('token', configWithPlatformInfo.token)
    })
    it('calls logAuditEvent when it crashes', async function () {
        const launcher = newLauncher({ config, checkIn: () => {} }, null, 'projectId', setup.snapshot)
        should(launcher).be.an.Object()
        await launcher.writeFlow()
        await launcher.writeCredentials()

        // stub the call to the audit logger function `logAuditEvent (event, body)`
        const logAuditEventStub = sinon.stub(launcher, 'logAuditEvent').resolves()

        // stub installDependencies so we don't actually install anything when starting
        sinon.stub(launcher, 'installDependencies').resolves()

        // simulate 5 recent start times so that it detects a boot loop and halts the restart process and reports a crash
        launcher.startTime.push(Date.now())
        launcher.startTime.push(Date.now())
        launcher.startTime.push(Date.now())
        launcher.startTime.push(Date.now())
        launcher.startTime.push(Date.now())

        await launcher.start() // childProcess.spawn is faked in beforeEach
        launcher.proc.kill()
        logAuditEventStub.calledOnce.should.be.true()
        logAuditEventStub.args[0][0].should.eql('crashed')
        logAuditEventStub.args[0][1].should.be.an.Object()
        await launcher.stop()
    })

    describe('Proxy Support', function () {
        afterEach(async function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            delete process.env.all_proxy
        })
        it('Passes proxy env vars to child process when set', async function () {
            process.env.http_proxy = 'http://http_proxy'
            process.env.https_proxy = 'http://https_proxy'
            process.env.no_proxy = 'no_proxy'
            process.env.all_proxy = 'all_proxy'

            const launcher = newLauncher({ config, checkIn: () => {} }, null, 'projectId', setup.snapshot)
            should(launcher).be.an.Object()
            await launcher.writeFlow()
            await launcher.writeCredentials()

            // stub installDependencies so we don't actually install anything when starting
            sinon.stub(launcher, 'installDependencies').resolves()

            await launcher.start() // childProcess.spawn is faked in beforeEach

            // check it spawns with the required settings
            console.log(launcher.proc.spawnargs)
            should(childProcess.spawn.args).be.an.Array().and.have.lengthOf(1)
            should(childProcess.spawn.args[0]).be.an.Array().and.have.lengthOf(3)
            const arg2 = childProcess.spawn.args[0][2]
            should(arg2).be.an.Object()
            arg2.should.have.property('env')
            arg2.env.should.have.property('http_proxy', 'http://http_proxy')
            arg2.env.should.have.property('https_proxy', 'http://https_proxy')
            arg2.env.should.have.property('no_proxy', 'no_proxy')
            arg2.env.should.have.property('all_proxy', 'all_proxy')
            await launcher.stop()
        })
    })
})
