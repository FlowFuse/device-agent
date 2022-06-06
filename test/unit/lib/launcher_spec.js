const should = require('should')
const { Launcher } = require('../../../lib/launcher')
const setup = require('../setup')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const path = require('path')
const os = require('os')
const logger = require('../../../lib/log')
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
        config.dir = await fs.mkdtemp(path.join(os.tmpdir(),'ff-launcher-'))
        await fs.mkdir(path.join(config.dir, 'project'))
    })

    afterEach(async function() {
        await fs.rm(config.dir, { recursive: true, force: true })
    })

    it('Create Snapshot Flow/Creds Files', async function() {
        const launcher = Launcher(config, setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = await fs.readFile(path.join(config.dir, 'project', 'flows.json'))
        const creds = await fs.readFile(path.join(config.dir, 'project', 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Write Settings', async function () {
        const launcher = Launcher(config, setup.snapshot)
        await launcher.writeSettings()
        const setFile = await fs.readFile(path.join(config.dir, 'project', 'settings.json'))
        const settings = JSON.parse(setFile)
        settings.should.have.property('port', 1880)
        settings.should.have.property('credentialSecret', 'secret')
    })

    it('Write package.json', async function () {
        const launcher = Launcher(config, setup.snapshot)
        await launcher.writePackage()
        const pkgFile = await fs.readFile(path.join(config.dir, 'project', 'package.json'))
        const package = JSON.parse(pkgFile)
        package.dependencies.should.have.property('node-red','2.2.2')
        package.dependencies.should.have.property('node-red-node-random','0.4.0')
    })
})
