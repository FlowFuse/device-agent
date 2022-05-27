const should = require('should')
const { Launcher } = require('../../../lib/launcher')
const setup = require('../setup')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')

describe('Edge Launcher', function () {
    this.timeout(10000)
    const config = {
        userDir: path.join(__dirname, '../..', 'testUserDir')
    }

    this.beforeAll(async function () {
        console.log(config.userDir)
        fs.mkdirSync(config.userDir)
    })

    this.afterAll(async function() {
        fs.rmSync(config.userDir, { recursive: true, force: true})
    })


    it('Create Snapshot Flow/Creds Files', async function() {
        const launcher = new Launcher(config, setup.snapshot)
        await launcher.writeFlow()
        await launcher.writeCredentials()
        const flow = fs.readFileSync(path.join(config.userDir, 'flows.json'))
        const creds = fs.readFileSync(path.join(config.userDir, 'flows_cred.json'))
        should(JSON.parse(flow)).eqls(setup.snapshot.flows)
        should(JSON.parse(creds)).eqls(setup.snapshot.credentials)
    })

    it('Install Nodes', async function () {
        const launcher = new Launcher(config, setup.snapshot)
        await launcher.writeNodes()
        return fsp.readFile(path.join(config.userDir, 'node_modules', 'node-red', 'red.js'))
    })
})
