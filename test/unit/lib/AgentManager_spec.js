const mocha = require('mocha') // eslint-disable-line
const should = require('should')
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
            console.error(error)
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
    it('Should not extend got with proxies if env vars are not set', function () {
        process.env.http_proxy = ''
        process.env.https_proxy = ''
        AgentManager.init({})
        should(AgentManager.client.defaults.options.agent?.http).be.undefined()
        should(AgentManager.client.defaults.options.agent?.https).be.undefined()
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
    it('Agent Manager should request config from FlowFuse when started in provisioning mode', async function () {
        const deviceFile = path.join(configDir, 'project', 'device.yml')
        const provisioningYaml = `
### PROVISIONING TOKEN ###
provisioningName: dt1
provisioningTeam: 12345ABCDE
provisioningToken: ffadp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
forgeURL: http://localhost:9752
httpStatic: /data
httpNodeAuth:
    user: user
    pass: $2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.
localAuth:
    user: localuser
    pass: $2y$08$/IyMCURWoRc4l0ctpJDlJedccKQDftGHC/4iGbKylVGKjUFdW5h3K
random: 123456
my_data:
    name: Alice
    address: "1234 Main St"
`
        await fs.writeFile(deviceFile, provisioningYaml)

        // setup a web server to mock the FlowFuse server
        let httpserver
        try {
            httpserver = require('http').createServer((req, res) => {
                if (/^\/api\/v1\/devices/.test(req.url)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({
                        version: '2.1',
                        id: 'device-hash-id',
                        forgeURL: 'http://localhost:3000',
                        credentials: {
                            token: 'i-am-token',
                            credentialSecret: 'cred-secret',
                            forgeURL: 'http://localhost:3000',
                            broker: {
                                url: 'mqtt://localhost:8883',
                                username: 'broker:user',
                                password: 'broker:pass'
                            }
                        }
                    }))
                } else if (req.url === '/') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end('{}')
                } else {
                    res.writeHead(404)
                    res.end('{}')
                }
            })
            httpserver.listen(9752)

            // init the AgentManager in Quick Connect mode
            const options = {
                ffUrl: 'http://localhost:9752',
                dir: configDir,
                deviceFile
            }
            AgentManager.init(options)
            sinon.spy(AgentManager, '_provisionDevice')
            sinon.spy(AgentManager, 'reloadConfig')
            await AgentManager.startAgent()
            AgentManager.reloadConfig.calledOnce.should.be.true()
            await AgentManager.provisionDevice()
            // check _provisionDevice was called
            AgentManager._provisionDevice.calledOnce.should.be.true()
            AgentManager._provisionDevice.args[0][0].should.be.an.Object() // called with the `device` object
            const provisioningData = AgentManager._provisionDevice.args[0][0]
            provisioningData.should.have.property('version').and.be.a.String()
            provisioningData.should.have.property('id', 'device-hash-id')
            provisioningData.should.have.property('credentials').and.be.an.Object()
            provisioningData.credentials.should.have.property('token', 'i-am-token')
            provisioningData.credentials.should.have.property('credentialSecret', 'cred-secret')
            provisioningData.credentials.should.have.property('forgeURL', 'http://localhost:3000')
            provisioningData.credentials.should.have.property('broker').and.be.an.Object()
            provisioningData.credentials.broker.should.have.property('url', 'mqtt://localhost:8883')
            provisioningData.credentials.broker.should.have.property('username', 'broker:user')
            provisioningData.credentials.broker.should.have.property('password', 'broker:pass')

            // check the config file was created and contains the correct data
            const deviceConfig = await fs.readFile(deviceFile, 'utf8')
            deviceConfig.should.match(/deviceId: device-hash-id/)
            deviceConfig.should.match(/forgeURL: http:\/\/localhost:3000/)
            deviceConfig.should.match(/credentialSecret: cred-secret/)
            deviceConfig.should.match(/token: i-am-token/)
            deviceConfig.should.match(/brokerURL: mqtt:\/\/localhost:8883/)
            deviceConfig.should.match(/brokerUsername: broker:user/)
            deviceConfig.should.match(/brokerPassword: broker:pass/)
            deviceConfig.should.match(/autoProvisioned: true/)

            // ensure extras are maintained
            deviceConfig.should.match(/httpStatic: \/data/)
            deviceConfig.should.match(/httpNodeAuth:/)
            deviceConfig.should.match(/ +user: user/)
            deviceConfig.should.match(/ +pass: \$2a\$08\$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN./)
            deviceConfig.should.match(/localAuth:/)
            deviceConfig.should.match(/ +user: localuser/)
            deviceConfig.should.match(/ +pass: \$2y\$08\$\/IyMCURWoRc4l0ctpJDlJedccKQDftGHC\/4iGbKylVGKjUFdW5h3K/)
            deviceConfig.should.match(/random: 123456/)
            deviceConfig.should.match(/my_data:/)
            deviceConfig.should.match(/ +name: Alice/)
            deviceConfig.should.match(/ +address: "*1234 Main St/)

            deviceConfig.should.not.match(/cliSetup: true/)
        } catch (error) {
            console.error(error)
            throw error
        } finally {
            // cleanup
            httpserver.close()
            AgentManager._provisionDevice.restore()
        }
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
            deviceConfig.should.match(/cliSetup: true/)
            deviceConfig.should.not.match(/autoProvisioned: true/)
        } catch (error) {
            console.error(error)
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
    describe('Proxy Support', function () {
        function getProvisioningOptions (https = false) {
            return {
                forgeURL: https ? 'https://testfuse.com' : 'http://localhost:9000',
                provisioningTeam: 'team1',
                provisioningToken: 'abcd',
                dir: configDir,
                deviceFile: path.join(configDir, 'project', 'device.yml')
            }
        }
        function getOtcOptions (https = false) {
            return {
                ffUrl: https ? 'https://testfuse.com' : 'http://localhost:9000',
                forgeURL: https ? 'https://testfuse.com' : 'http://localhost:9000',
                otc: 'one-time-code',
                dir: configDir,
                deviceFile: path.join(configDir, 'project', 'device.yml')
            }
        }

        afterEach(async function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            delete process.env.all_proxy
        })

        it('Calls GOT with no agent when env vars are not set', async function () {
            // const deviceFile = path.join(configDir, 'project', 'device.yml')
            // await fs.writeFile(deviceFile, 'forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
            delete process.env.http_proxy
            delete process.env.https_proxy

            sinon.stub(AgentManager, 'canBeProvisioned').returns(true)
            sinon.stub(AgentManager, '_provisionDevice').resolves()
            sinon.stub(AgentManager, '_getDeviceInfo').resolves({ host: 'localhost', ip: '127.0.0.1', mac: '0:0:0:0:0:0', forgeOk: true })

            // provisionDevice http
            AgentManager.init(getProvisioningOptions())
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.provisionDevice(AgentManager.options.forgeURL, AgentManager.options.provisioningTeam, AgentManager.options.provisioningToken)
            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            should(AgentManager.client.post.args[0][1].agent?.http).be.undefined()
            should(AgentManager.client.post.args[0][1].agent?.https).be.undefined()

            // provisionDevice https
            AgentManager.init(getProvisioningOptions(true))
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.provisionDevice(AgentManager.options.forgeURL, AgentManager.options.provisioningTeam, AgentManager.options.provisioningToken)
            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            should(AgentManager.client.post.args[0][1].agent?.http).be.undefined()
            should(AgentManager.client.post.args[0][1].agent?.https).be.undefined()

            // quickConnectDevice http
            AgentManager.init(getOtcOptions())
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.quickConnectDevice()
            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            should(AgentManager.client.post.args[0][1].agent?.http).be.undefined()
            should(AgentManager.client.post.args[0][1].agent?.https).be.undefined()

            // quickConnectDevice https
            AgentManager.init(getOtcOptions(true))
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.quickConnectDevice()
            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            should(AgentManager.client.post.args[0][1].agent?.http).be.undefined()
            should(AgentManager.client.post.args[0][1].agent?.https).be.undefined()
        })

        it('Calls GOT with an http agent when env var is set (provisionDevice)', async function () {
            const deviceFile = path.join(configDir, 'project', 'device.yml')
            await fs.writeFile(deviceFile, 'forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
            process.env.http_proxy = 'http://http_proxy:1234'
            AgentManager.init({ deviceFile })
            await AgentManager.reloadConfig()

            sinon.stub(AgentManager, 'canBeProvisioned').returns(true)
            sinon.stub(AgentManager, '_provisionDevice').resolves()
            sinon.stub(AgentManager, '_getDeviceInfo').resolves({ host: 'localhost', ip: '127.0.0.1', mac: '0:0:0:0:0:0', forgeOk: true })
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.provisionDevice()

            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            AgentManager.client.post.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.post.args[0][1].agent.should.have.property('http').instanceOf(require('http-proxy-agent').HttpProxyAgent)
        })
        it('Calls GOT with an https agent when env var is set (provisionDevice)', async function () {
            const deviceFile = path.join(configDir, 'project', 'device.yml')
            await fs.writeFile(deviceFile, 'forgeURL: https://testfuse.com\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
            process.env.https_proxy = 'http://http_proxy:1234'
            AgentManager.init({ deviceFile })
            await AgentManager.reloadConfig()

            sinon.stub(AgentManager, 'canBeProvisioned').returns(true)
            sinon.stub(AgentManager, '_provisionDevice').resolves()
            sinon.stub(AgentManager, '_getDeviceInfo').resolves({ host: 'localhost', ip: '127.0.0.1', mac: '0:0:0:0:0:0', forgeOk: true })
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.provisionDevice()

            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            AgentManager.client.post.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.post.args[0][1].agent.should.have.property('https').instanceOf(require('https-proxy-agent').HttpsProxyAgent)
        })
        it('Calls GOT with an http agent when env var is set (quickConnectDevice)', async function () {
            process.env.http_proxy = 'http://http_proxy:1234'
            AgentManager.init(getOtcOptions())

            sinon.stub(AgentManager, 'canBeProvisioned').returns(true)
            sinon.stub(AgentManager, '_provisionDevice').resolves()
            sinon.stub(AgentManager, '_getDeviceInfo').resolves({ host: 'localhost', ip: '127.0.0.1', mac: '0:0:0:0:0:0', forgeOk: true })
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.quickConnectDevice()

            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            AgentManager.client.post.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.post.args[0][1].agent.should.have.property('http').instanceOf(require('http-proxy-agent').HttpProxyAgent)
        })

        it('Calls GOT with an https agent when env var is set (quickConnectDevice)', async function () {
            process.env.https_proxy = 'http://https_proxy:4567'
            AgentManager.init(getOtcOptions(true))

            sinon.stub(AgentManager, 'canBeProvisioned').returns(true)
            sinon.stub(AgentManager, '_provisionDevice').resolves()
            sinon.stub(AgentManager, '_getDeviceInfo').resolves({ host: 'localhost', ip: '127.0.0.1', mac: '0:0:0:0:0:0', forgeOk: true })
            sinon.stub(AgentManager.client, 'post').resolves({ statusCode: 200, body: '{}' })
            await AgentManager.quickConnectDevice()

            AgentManager.client.post.calledOnce.should.be.true()
            AgentManager.client.post.args[0][1].should.be.an.Object()
            AgentManager.client.post.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.post.args[0][1].agent.should.have.property('https').instanceOf(require('https-proxy-agent').HttpsProxyAgent)
        })
        it('Calls GOT with an http agent when env var is set (_getDeviceInfo)', async function () {
            const deviceFile = path.join(configDir, 'project', 'device.yml')
            await fs.writeFile(deviceFile, 'forgeURL: http://localhost:9000\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
            process.env.http_proxy = 'http://http_proxy:1234'
            AgentManager.init({ deviceFile })
            await AgentManager.reloadConfig()

            sinon.stub(AgentManager.client, 'get').resolves({ socket: { localAddress: '127.0.0.1' }, body: '{}', statusCode: 200 })
            await AgentManager._getDeviceInfo('http://localhost:9000', 'abcd')

            AgentManager.client.get.calledOnce.should.be.true()
            AgentManager.client.get.args[0][1].should.be.an.Object()
            AgentManager.client.get.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.get.args[0][1].agent.should.have.property('http').instanceOf(require('http-proxy-agent').HttpProxyAgent)
        })
        it('Calls GOT with an https agent when env var is set (_getDeviceInfo)', async function () {
            const deviceFile = path.join(configDir, 'project', 'device.yml')
            await fs.writeFile(deviceFile, 'forgeURL: https://testfuse.com\nprovisioningTeam: team1\nprovisioningToken: abcd\n')
            process.env.https_proxy = 'http://http_proxy:1234'
            AgentManager.init({ deviceFile })
            await AgentManager.reloadConfig()

            sinon.stub(AgentManager.client, 'get').resolves({ socket: { localAddress: '127.0.0.1' }, body: '{}', statusCode: 200 })
            await AgentManager._getDeviceInfo('https://testfuse.com', 'abcd')

            AgentManager.client.get.calledOnce.should.be.true()
            AgentManager.client.get.args[0][1].should.be.an.Object()
            AgentManager.client.get.args[0][1].should.have.property('agent').and.be.an.Object()
            AgentManager.client.get.args[0][1].agent.should.have.property('https').instanceOf(require('https-proxy-agent').HttpsProxyAgent)
        })
    })
})
