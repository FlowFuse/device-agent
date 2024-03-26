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
    it('Writes flowfuse theme files', async function () {
        const launcher = newLauncher({ config }, null, 'projectId', setup.snapshot)
        await launcher.writeThemeFiles()
        const expectedTargetDir = path.join(config.dir, 'project', 'node_modules', '@flowfuse', 'nr-theme')
        const themeFiles = await fs.readdir(expectedTargetDir)
        themeFiles.should.containEql('package.json')
        themeFiles.should.containEql('lib')
        themeFiles.should.containEql('resources')

        const packageFile = await fs.readFile(path.join(expectedTargetDir, 'package.json'))
        const packageJSON = JSON.parse(packageFile)
        packageJSON.should.have.property('name', '@flowfuse/nr-theme')

        // ensure the lib/theme/common, lib/theme/forge-dark and lib/theme/forge-light directories exist
        const libDir = path.join(expectedTargetDir, 'lib')
        const themeDir = path.join(libDir, 'theme')
        const commonDir = path.join(themeDir, 'common')
        const darkDir = path.join(themeDir, 'forge-dark')
        const lightDir = path.join(themeDir, 'forge-light')
        const commonDirStat = await fs.stat(commonDir)
        const darkDirStat = await fs.stat(darkDir)
        const lightDirStat = await fs.stat(lightDir)
        commonDirStat.isDirectory().should.be.true()
        darkDirStat.isDirectory().should.be.true()
        lightDirStat.isDirectory().should.be.true()
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
        settings.editorTheme.palette.should.have.a.property('catalogue').and.be.an.Array()
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
})
