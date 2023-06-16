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

    beforeEach(async function () {
        config.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(config.dir, 'project'))
    })

    afterEach(async function () {
        await fs.rm(config.dir, { recursive: true, force: true })
    })

    it('Create Snapshot Flow/Creds Files', async function () {
        const launcher = newLauncher(config, 'projectId', setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Write Settings - without broker', async function () {
        const launcher = newLauncher(config, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
        settings.should.have.property('flowforge')
        settings.flowforge.should.have.property('projectID', 'PROJECTID')
        settings.flowforge.should.not.have.property('projectLink')
    })
    it('Write Settings - with broker', async function () {
        const launcher = newLauncher({
            ...config,
            brokerURL: 'BURL',
            brokerUsername: 'BUSER:TEAMID:deviceid',
            brokerPassword: 'BPASS'
        }, 'PROJECTID', setup.snapshot)
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
        const launcher = newLauncher(config, 'projectId', setup.snapshot)
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
        }, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('https')
    })
})
