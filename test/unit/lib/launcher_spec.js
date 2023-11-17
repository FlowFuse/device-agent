const should = require('should')
const sinon = require('sinon')
const utils = require('../../../lib/utils')
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
    const nodeEnv = process.env.NODE_ENV
    beforeEach(async function () {
        config.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(config.dir, 'project'))
    })

    afterEach(async function () {
        await fs.rm(config.dir, { recursive: true, force: true })
        process.env.NODE_ENV = nodeEnv // restore NODE_ENV
        sinon.restore()
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
    it('Uses flowfuse project nodes from dev-env when detected', async function () {
        // Summary: if dev-env is detected, then the launcher should use the project nodes from dev-env
        const licensedConfig = {
            ...config,
            licenseType: 'ee',
            licensed: true
        }
        // set NODE_ENV to 'development' to simulate dev-env
        process.env.NODE_ENV = 'development'
        // spy utils.getPackagePath to ensure it is called with 'nr-project-nodes'
        sinon.spy(utils, 'getPackagePath')
        const launcher = newLauncher(licensedConfig, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()

        // check that utils.getPackagePath was called with 'nr-project-nodes'
        utils.getPackagePath.calledWith('nr-project-nodes').should.be.true()

        // check that settings.nodesDir contains the dev path to the project nodes
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('nodesDir')

        // because we are in dev-env, settings.nodesDir should contain the dev path + 'packages/nr-project-nodes'
        settings.nodesDir.filter((dir) => dir.endsWith('packages/nr-project-nodes')).should.have.a.lengthOf(1)
    })
    it('Uses flowfuse project nodes from device node_modules is runtime', async function () {
        // Summary: if dev-env is not detected, then the launcher should use the project nodes from device-agent node_modules
        const licensedConfig = {
            ...config,
            licenseType: 'ee',
            licensed: true
        }
        // set NODE_ENV to 'production' to simulate runtime
        process.env.NODE_ENV = 'production'
        // spy utils.getPackagePath to ensure it is called with '@flowfuse/nr-project-nodes'
        sinon.spy(utils, 'getPackagePath')
        const launcher = newLauncher(licensedConfig, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()

        // check that utils.getPackagePath was called with '@flowfuse/nr-project-nodes'
        utils.getPackagePath.calledWith('@flowfuse/nr-project-nodes').should.be.true()

        // check that settings.nodesDir contains the dev path to the project nodes
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('nodesDir')

        // because we are in runtime, settings.nodesDir should contain the agent path + 'node_modules/@flowfuse/nr-project-nodes'
        settings.nodesDir.filter((dir) => dir.endsWith('node_modules/@flowfuse/nr-project-nodes')).should.have.a.lengthOf(1)
    })
    it('Does not add path for project nodes when unlicensed', async function () {
        // Summary: if NON EE, then nodesDir should either be empty OR should NOT contain 'nr-project-nodes'
        const unlicensedConfig = {
            ...config,
            licensed: false
        }
        const launcher = newLauncher(unlicensedConfig, null, 'projectId', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        if (settings.nodesDir && Array.isArray(settings.nodesDir) && settings.nodesDir.length > 0) {
            settings.nodesDir.filter((dir) => dir.endsWith('nr-project-nodes')).should.have.a.lengthOf(0)
        }
    })
})
