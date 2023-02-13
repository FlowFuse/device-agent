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
        AgentManager.should.have.property('options').and.eql({})
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
