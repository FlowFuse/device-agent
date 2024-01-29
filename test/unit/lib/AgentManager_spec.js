const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const agent = require('../../../lib/agent')
// const httpClient = require('../../../lib/http')
// const mqttClient = require('../../../lib/mqtt')
// const launcher = require('../../../lib/launcher.js')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { AgentManager } = require('../../../lib/AgentManager')

describe('Test the AgentManager', function () {
    let configDir
    beforeEach(async function () {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        await fs.mkdir(path.join(configDir, 'project'))
        try {
            sinon.stub(agent, 'newAgent').callsFake(function () {
                return {
                    start: sinon.stub().returns('started'),
                    stop: sinon.stub(),
                    dummy: sinon.stub().returns('for ensuring the sandbox is used once')
                }
            })
        } catch (error) {
            console.log(error)
        }
        agent.newAgent().dummy()
    })
    afterEach(async function () {
        await AgentManager.close()
        configDir && await fs.rm(configDir, { recursive: true, force: true })
        sinon.restore()
    })
    after(function () {
        sinon.reset()
    })
    it('Create and init the Agent Manager', function () {
        AgentManager.init({})
        AgentManager.should.have.property('options').and.be.an.Object()
        AgentManager.state.should.eql('unknown')
    })
    it('Agent Manager should exit cleanly', async function () {
        AgentManager.init({})
        await AgentManager.close()
        AgentManager.exiting.should.be.true()
    })
    it('Agent Manager loads config from file (provisioning token)', async function () {
        const deviceFile = path.join(configDir, 'project', 'device.yml')
        await fs.writeFile(deviceFile, 'forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
        AgentManager.init({
            deviceFile
        })
        await AgentManager.reloadConfig()

        AgentManager.should.have.property('options')
        AgentManager.options.should.have.property('deviceFile', deviceFile)
        AgentManager.should.have.property('configuration')
        AgentManager.configuration.should.have.property('version').and.be.a.String()
        AgentManager.configuration.should.have.property('token', 'abcd')
        AgentManager.configuration.should.have.property('forgeURL', 'http://localhost:9000')
        AgentManager.configuration.should.have.property('provisioningTeam', 'team1')
        AgentManager.configuration.should.have.property('provisioningMode', true)
    })
    it('Agent Manager loads config from file (regular credentials)', async function () {
        const deviceFile = path.join(configDir, 'project', 'device.yml')
        await fs.writeFile(deviceFile, 'deviceId: ididid\nforgeURL: http://localhost:9999\ncredentialSecret: yoohoo\ntoken: bbbb\n')
        AgentManager.init({
            deviceFile
        })
        await AgentManager.reloadConfig()

        AgentManager.should.have.property('options')
        AgentManager.options.should.have.property('deviceFile', deviceFile)
        AgentManager.should.have.property('configuration')
        AgentManager.configuration.should.have.property('version').and.be.a.String()
        AgentManager.configuration.should.have.property('deviceId', 'ididid')
        AgentManager.configuration.should.have.property('token', 'bbbb')
        AgentManager.configuration.should.have.property('credentialSecret', 'yoohoo')
        AgentManager.configuration.should.have.property('forgeURL', 'http://localhost:9999')
        should(AgentManager.configuration.provisioningMode !== true).be.true()
    })
    it('Agent Manager should request config from FlowFuse when started in Quick Connect mode', async function () {
        const deviceFile = path.join(configDir, 'project', 'device.yml')
        // setup a web server to mock the FlowFuse server
        let httpserver
        try {
            httpserver = require('http').createServer((req, res) => {
                if (req.url === '/api/v1/devices/') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({
                        version: '2.1',
                        id: 'device-hash-id',
                        forgeURL: 'http://localhost:3000',
                        credentials: {
                            token: 'abcd',
                            credentialSecret: 'yoohoo',
                            forgeURL: 'http://localhost:3000',
                            broker: {
                                url: 'mqtt://localhost:8883',
                                username: 'broker:user',
                                password: 'broker:pass'
                            }
                        }
                    }))
                } else {
                    res.writeHead(404)
                    res.end('{}')
                }
            })
            httpserver.listen(9753)

            // init the AgentManager in Quick Connect mode
            const options = {
                ffUrl: 'http://localhost:9753',
                otc: 'one-time-code',
                dir: configDir,
                deviceFile
            }
            AgentManager.init(options)
            sinon.spy(AgentManager, '_provisionDevice')

            // perform the Quick Connect
            await AgentManager.quickConnectDevice()

            // check _provisionDevice was called
            AgentManager._provisionDevice.calledOnce.should.be.true()
            AgentManager._provisionDevice.args[0][0].should.be.an.Object() // called with the `device` object
            const provisioningData = AgentManager._provisionDevice.args[0][0]
            provisioningData.should.have.property('version').and.be.a.String()
            provisioningData.should.have.property('id', 'device-hash-id')
            provisioningData.should.have.property('credentials').and.be.an.Object()
            provisioningData.credentials.should.have.property('token', 'abcd')
            provisioningData.credentials.should.have.property('credentialSecret', 'yoohoo')
            provisioningData.credentials.should.have.property('forgeURL', 'http://localhost:3000')
            provisioningData.credentials.should.have.property('broker').and.be.an.Object()
            provisioningData.credentials.broker.should.have.property('url', 'mqtt://localhost:8883')
            provisioningData.credentials.broker.should.have.property('username', 'broker:user')
            provisioningData.credentials.broker.should.have.property('password', 'broker:pass')

            // check the config file was created and contains the correct data
            const deviceConfig = await fs.readFile(deviceFile, 'utf8')
            deviceConfig.should.match(/deviceId: device-hash-id/)
            deviceConfig.should.match(/forgeURL: http:\/\/localhost:3000/)
            deviceConfig.should.match(/credentialSecret: yoohoo/)
            deviceConfig.should.match(/token: abcd/)
            deviceConfig.should.match(/brokerURL: mqtt:\/\/localhost:8883/)
            deviceConfig.should.match(/brokerUsername: broker:user/)
            deviceConfig.should.match(/brokerPassword: broker:pass/)
            deviceConfig.should.match(/quickConnected: true/)
        } catch (error) {
            console.log(error)
            throw error
        } finally {
            // cleanup
            httpserver.close()
            AgentManager._provisionDevice.restore()
        }
    })
    it('Agent Manager should call agent start (regular credentials)', async function () {
        this.skip() // TODO: fix this test
        const deviceFile = path.join(configDir, 'project', 'device.yml')
        await fs.writeFile(deviceFile, 'deviceId: ididid\nforgeURL: http://localhost:9999\ncredentialSecret: yoohoo\ntoken: bbbb\n')
        AgentManager.init({
            deviceFile
        })
        await AgentManager.startAgent()
        agent.newAgent.calledOnce.should.be.true()
        AgentManager.agent.start.calledOnce.should.be.true()
    })
})
