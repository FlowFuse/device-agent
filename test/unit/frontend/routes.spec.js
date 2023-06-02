// set NODE_ENV to test so that the main app doesn't start automatically
process.env.NODE_ENV = 'test'
const should = require('should') // eslint-disable-line
const sinon = require('sinon') // eslint-disable-line
const { default: Got } = require('got/dist/source')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { AgentManager } = require('../../../lib/AgentManager')
const { WebServer } = require('../../../frontend/server')

describe('Device Agent Web Server Routes (API)', function () {
    /** @type {string} the config directory for the agent */
    let configDir

    // /**
    //  * Starts the app with the specified CLI args
    //  * @param {Array<String[]>} args - an array of arrays, each containing a single or pair of CLI args
    //  * @returns App
    //  */
    // function startApp (args, options = {}) {
    //     process.argv = process.argv.slice(0, 2)
    //     // http.createServer.reset()
    //     for (const arg of args) {
    //         process.argv.push(...arg)
    //     }
    //     const app = App.main(options)
    //     return app
    // }

    const got = Got.extend({
        prefixUrl: 'http://localhost:1879',
        throwHttpErrors: false
    })

    /** @type {WebServer} */
    let webServer

    before(async function () {
        process.argv = process.argv.slice(0, 2)
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        process.argv.push('--dir', configDir)
        process.argv.push('--config', 'device.yml')
        await fs.mkdir(path.join(configDir, 'project'))

        webServer = new WebServer()
        webServer.initialize(AgentManager, {
            port: 1879,
            host: '0.0.0.0',
            credentials: {
                username: 'admin',
                password: 'admin-pass'
            },
            runtime: 2,
            dir: configDir,
            config: 'device.yml',
            deviceFile: path.join(configDir, 'device.yml')
        })
        webServer.start().then(() => {
            // UI Web Server started'
        }).catch((err) => {
            should.fail(err)
        })

        // stub the console logging so that we don't get console output
        sinon.stub(console, 'log').callsFake((..._args) => {})
        sinon.stub(console, 'info').callsFake((..._args) => {})
        sinon.stub(console, 'warn').callsFake((..._args) => {})
        sinon.stub(console, 'debug').callsFake((..._args) => {})
        sinon.stub(console, 'error').callsFake((..._args) => {})
    })

    after(async function () {
        if (webServer) {
            await webServer.stop()
        }
        await fs.rm(configDir, { recursive: true, force: true })
        sinon.restore()
    })

    // beforeEach(function () {
    //     // stub the logger so that we don't get console output
    //     sinon.stub(logging, 'info')
    //     sinon.stub(logging, 'error')
    //     sinon.stub(logging, 'warn')
    //     sinon.stub(logging, 'debug')
    //     sinon.stub(logging, 'log')
    // })
    // afterEach(function () {
    //     sinon.restore()
    // })

    it('all endpoints (except assets) return 401 if not authorized', async () => {
        (await got.get('')).statusCode.should.be.eql(401);
        (await got.get('status')).statusCode.should.be.eql(401);
        (await got.get('home')).statusCode.should.be.eql(401);
        (await got.post('submit')).statusCode.should.be.eql(401)
    })
    it('/home returns html content', async () => {
        const response = await got.get('home', {
            username: 'admin',
            password: 'admin-pass'
        })
        response.statusCode.should.be.eql(200)
        response.headers['content-type'].should.be.eql('text/html')
    })
    it('/assets returns content without auth', async () => {
        const response = await got.get('assets/favicon.ico')
        response.statusCode.should.be.eql(200)
        response.headers['content-type'].should.be.eql('image/x-icon')
    })
    it('/status returns expected items', async () => {
        // force values into the options and agentManager so that the status endpoint returns something
        webServer.agentManager.options.version = '9.9.9'
        webServer.agentManager.options.dir = 'random/dir'
        webServer.agentManager.options.deviceFile = path.join(webServer.agentManager.options.dir, 'device.yml')
        webServer.agentManager.options.port = 8128 // perfect number
        webServer.agentManager.agent = {
            currentState: 'running',
            currentMode: 'developer',
            currentSnapshot: {
                name: 'snapshot1',
                description: 'snapshot1 description'
            },
            currentSettings: {
                env: {
                    FF_DEVICE_NAME: 'device1',
                    FF_DEVICE_TYPE: 'type1'
                }
            },
            config: {
                deviceId: 'DeV1C31D',
                forgeURL: 'http://127.0.0.1:3000',
                token: 'ffd_abcdef1234567890',
                credentialSecret: '12345678901234567890123456789012',
                brokerURL: 'ws://[::1]:9884',
                brokerUsername: 'device:T34M1D:DeV1C31D',
                brokerPassword: 'ffbd_et_12345678901234567890123456789012',
                autoProvisioned: true,
                provisioningMode: true,
                provisioningName: 'pname1',
                provisioningTeam: 'pteam1'
            }
        }

        const response = await got.get('status', {
            username: 'admin',
            password: 'admin-pass'
        })
        response.statusCode.should.be.eql(200)
        response.headers['content-type'].should.be.eql('application/json')
        const body = JSON.parse(response.body)

        body.should.have.property('success', true)

        // properties that SHOULD be present
        // status: {state,name,type,mode,version,snapshotName,snapshotDesc,deviceClock}
        body.should.have.property('status').and.be.a.Object()
        body.status.should.have.property('state', 'running')
        body.status.should.have.property('name', 'device1')
        body.status.should.have.property('type', 'type1')
        body.status.should.have.property('mode', 'developer')
        body.status.should.have.property('version', '9.9.9')
        body.status.should.have.property('snapshotName', 'snapshot1')
        body.status.should.have.property('snapshotDesc', 'snapshot1 description')
        body.status.should.have.property('deviceClock').and.be.a.Number()

        // config: {deviceId,forgeURL,dir,deviceFile,port,provisioningMode,provisioningName,provisioningTeam}
        body.status.should.have.property('config').and.be.a.Object()
        body.status.config.should.have.property('deviceId', 'DeV1C31D')
        body.status.config.should.have.property('forgeURL', 'http://127.0.0.1:3000')
        body.status.config.should.have.property('dir', 'random/dir')
        body.status.config.should.have.property('deviceFile', path.join('random/dir', 'device.yml'))
        body.status.config.should.have.property('port', 8128)
        body.status.config.should.have.property('provisioningMode', true)
        body.status.config.should.have.property('provisioningName', 'pname1')
        body.status.config.should.have.property('provisioningTeam', 'pteam1')

        // properties that SHOULD NOT be present
        // token, credentialSecret, brokerURL, brokerUsername, brokerPassword, autoProvisioned
        body.status.should.only.have.keys('state', 'name', 'type', 'mode', 'version', 'snapshotName', 'snapshotDesc', 'deviceClock', 'config')
        body.status.config.should.only.have.keys('deviceId', 'forgeURL', 'dir', 'deviceFile', 'port', 'provisioningMode', 'provisioningName', 'provisioningTeam')
    })

    it('/submit with bad yaml results in 400', async () => {
        const response = await got.post('submit', {
            username: 'admin',
            password: 'admin-pass',
            json: {
                config: 'bad yaml'
            }
        })
        response.statusCode.should.be.eql(400)
    })
    it('/submit with good yaml writes file', async () => {
        // mock agentManager.reloadAgent so that it doesn't actually reload the agent
        sinon.stub(webServer.agentManager, 'reloadAgent').yields(null, 'starting')
        const response = await got.post('submit', {
            username: 'admin',
            password: 'admin-pass',
            json: {
                config: 'forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n'
            }
        })
        response.statusCode.should.be.eql(200)
        const deviceFile = path.join(configDir, 'device.yml')
        const deviceConfig = await fs.readFile(deviceFile, 'utf8')
        deviceConfig.should.be.eql('forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n')

        webServer.agentManager.reloadAgent.calledOnce.should.be.true()
        webServer.agentManager.reloadAgent.restore()
    })
})
