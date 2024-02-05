const should = require('should')
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
    })

    afterEach(async function () {
        await fs.rm(config.dir, { recursive: true, force: true })
    })

    it('Create Snapshot Flow/Creds Files, instance bound device', async function () {
        const launcher = newLauncher(config, null, 'projectId', setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Create Snapshot Flow/Creds Files, application bound device', async function () {
        const launcher = newLauncher(config, 'applicationId', null, setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Write Settings - without broker, instance bound device', async function () {
        const launcher = newLauncher(config, null, 'PROJECTID', setup.snapshot)
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
        const launcher = newLauncher(config, 'APP-ID', null, setup.snapshot)
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
            ...config,
            brokerURL: 'BURL',
            brokerUsername: 'BUSER:TEAMID:deviceid',
            brokerPassword: 'BPASS'
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
        settings.flowforge.projectLink.should.have.property('broker')
        settings.flowforge.projectLink.broker.should.have.property('url', 'BURL')
        settings.flowforge.projectLink.broker.should.have.property('username', 'BUSER:TEAMID:deviceid')
        settings.flowforge.projectLink.broker.should.have.property('password', 'BPASS')
    })

    it('Write package.json', async function () {
        const launcher = newLauncher(config, null, 'projectId', setup.snapshot)
        await launcher.writePackage()
        const pkgFile = await fs.readFile(path.join(config.dir, 'project', 'package.json'))
        const pkg = JSON.parse(pkgFile)
        pkg.dependencies.should.have.property('node-red', '2.2.2')
        pkg.dependencies.should.have.property('node-red-node-random', '0.4.0')
        pkg.name.should.eqls('TEST_PROJECT')
        pkg.version.should.eqls('0.0.0-aaaabbbbcccc')
    })

    it('Write Settings - with HTTPS, raw values', async function () {
        const launcher = newLauncher({
            ...config,
            https: {
                cert: '123',
                ca: '456',
                key: '789'
            }
        }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('https')
    })
    it('Write Settings - with httpStatic', async function () {
        const launcher = newLauncher({
            ...config,
            httpStatic: 'static-path'
        }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('httpStatic', 'static-path')
    })
    it('Write .npmrc file', async function () {
        const launcher = newLauncher(config, null, 'projectId', setup.snapshot)
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
        const launcher = newLauncher(licensedConfig, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('editorTheme')
        settings.editorTheme.should.have.property('palette')
        settings.editorTheme.palette.should.have.a.property('catalogue').and.be.an.Array()
        settings.editorTheme.palette.catalogue.should.have.a.lengthOf(3)
        settings.editorTheme.palette.catalogue[0].should.eql('foo')
        settings.editorTheme.palette.catalogue[1].should.eql('bar')
        settings.editorTheme.palette.catalogue[2].should.eql('baz')
    })
    it('ignores custom catalogue when NOT licensed', async function () {
        const launcher = newLauncher(config, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('editorTheme')
        settings.editorTheme.should.have.property('palette')
        settings.editorTheme.palette.should.not.have.a.property('catalogue')
    })
    it('sets up audit logging for the node-red instance', async function () {
        const launcher = newLauncher(configWithPlatformInfo, null, 'projectId', setup.snapshot)
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
})
