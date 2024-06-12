const mocha = require('mocha') // eslint-disable-line
const should = require('should') // eslint-disable-line
const sinon = require('sinon')
const { HTTPClient } = require('../../../lib/http')
let currentId = 0 // incrementing id for each agent

/** creates a mock Agent with sinon fakes for the methods
 * getState, setState, getCurrentFlows, getCurrentCredentials, getCurrentPackage
 * @param {object} opts
 * @param {string} opts.currentMode
 * @param {string} opts.currentSnapshot
 * @param {string} opts.currentProject
 * @param {string} opts.currentSettings
 * @param {string} opts.state
 * @param {object} opts.flows
 * @param {string} opts.credentials
 * @param {string} opts.package
 * @returns {Agent}
 */
function createAgent (opts) {
    opts = opts || {}
    opts.state = opts.state || 'stopped'
    const newAgent = function () {
        this.updating = false
        this.currentMode = opts.currentMode || null
        this.editorToken = opts.editorToken
        this.currentSnapshot = opts.currentSnapshot
        this.currentProject = opts.currentProject
        this.currentSettings = opts.currentSettings
        this.state = opts.currentState
        this.flows = opts.flows
        this.credentials = opts.credentials
        this.package = opts.package
        const agent = this
        return {
            currentMode: agent.currentMode,
            editorToken: agent.editorToken,
            currentSnapshot: agent.currentSnapshot,
            currentProject: agent.currentProject,
            currentSettings: agent.currentSettings,
            getState: sinon.fake.returns(agent.state),
            setState: sinon.fake.call(function (state) {
                agent.state = agent.state || {}
                agent.state = Object.assign({}, agent.state, state)
            }),
            getCurrentFlows: sinon.fake.returns(agent.flows),
            getCurrentCredentials: sinon.fake.returns(agent.credentials),
            getCurrentPackage: sinon.fake.returns(agent.package),
            saveEditorToken: sinon.fake(),
            startNR: sinon.fake.returns(true),
            restartNR: sinon.fake.returns(true),
            suspendNR: sinon.fake.returns(true),
            checkIn: sinon.fake()
        }
    }
    return newAgent()
}

/**
 * Create a new httpClientComms instance
 * @param {*} opts - lib/mqtt options
 * @param {string} opts.device - device id
 * @param {string} opts.project - project id
 * @param {string} opts.snapshotId - snapshot id
 * @param {string} opts.settingsId - settings id
 * @param {string} opts.mode - mode
 * @param {string} opts.editorToken - editor token
 * @param {string} opts.state - state
 * @param {object} opts.flows - flows
 * @param {string} opts.credentials - credentials
 * @param {string} opts.package - package
 */
function createHttpClient (opts, clientOpts) {
    opts = opts || {}
    currentId++
    const device = opts.device || `device${currentId}`
    const project = opts.project !== null ? `project${currentId}` : null
    const snapshot = opts.snapshotId !== null ? { id: opts.snapshotId } : null
    const settings = opts.settingsId !== null ? { hash: opts.settingsId } : null
    const mode = opts.mode || 'developer'
    const editorToken = opts.editorToken || null

    const agent = createAgent({
        currentMode: mode,
        editorToken,
        currentProject: project,
        currentSettings: settings,
        currentSnapshot: snapshot,
        state: opts.state || 'stopped',
        flows: opts.flows,
        credentials: opts.credentials,
        package: opts.package
    })

    clientOpts = clientOpts || {}
    const daHTTP = new HTTPClient(agent, {
        forgeURL: clientOpts.forgeURL || 'http://localhost:9000',
        deviceId: device,
        token: clientOpts.token || 'token' + currentId
    })

    sinon.stub(daHTTP.heartbeat, 'start')
    return daHTTP
}

describe('HTTP Comms', function () {
    beforeEach(async function () {
        sinon.stub(console, 'log') // hush console.log
        sinon.stub(console, 'info') // hush console.info
    })

    afterEach(async function () {
        delete process.env.http_proxy
        delete process.env.https_proxy
        delete process.env.no_proxy
        delete process.env.all_proxy
        sinon.restore()
    })

    describe('Proxy Support', function () {
        it('Creates the HTTP Comms Client', async function () {
            // ensure proxy settings are not set
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            const httpClient = createHttpClient({
                device: 'my-device-1',
                project: 'project1',
                snapshotId: 'snapshot1',
                settingsId: 'settings1',
                mode: 'developer',
                editorToken: 'editor-token'
            }, {
                forgeURL: 'http://localhost:9876',
                token: 'token-token-123'
            })
            httpClient.should.have.a.property('agent').and.be.an.Object()
            httpClient.should.have.a.property('config').and.be.an.Object()
            httpClient.config.should.have.a.property('forgeURL', 'http://localhost:9876')
            httpClient.config.should.have.a.property('token', 'token-token-123')
            httpClient.config.should.have.a.property('deviceId', 'my-device-1')

            // ensure the client is a got instance
            httpClient.should.have.property('client')
            httpClient.client.should.have.property('defaults').and.be.an.Object()
            httpClient.client.defaults.should.have.property('options').and.be.an.Object()
            httpClient.client.defaults.options.should.have.property('prefixUrl', 'http://localhost:9876/api/v1/devices/my-device-1/')

            // ensure proxies are not set
            should(httpClient.client.defaults.options.agent?.http).be.undefined()
            should(httpClient.client.defaults.options.agent?.https).be.undefined()
        })

        it('Extends GOT with http proxy when env var is set', async function () {
            process.env.http_proxy = 'http://http_proxy:1234'
            process.env.https_proxy = ''
            process.env.no_proxy = ''
            const httpClient = createHttpClient({}, {
                forgeURL: 'http://localhost:2222',
                token: 'token-token-2222'
            })
            httpClient.should.have.property('client')
            should(httpClient.client.defaults.options.agent?.http).be.instanceOf(require('http-proxy-agent').HttpProxyAgent)
            httpClient.client.defaults.options.agent.http.proxy.should.have.property('hostname', 'http_proxy')
            httpClient.client.defaults.options.agent.http.proxy.should.have.property('port', '1234')
            should(httpClient.client.defaults.options.agent?.https).be.undefined()
        })
        it('Extends GOT with https proxy when env var is set', async function () {
            process.env.http_proxy = ''
            process.env.https_proxy = 'http://https_proxy:4321'
            process.env.no_proxy = ''
            const httpClient = createHttpClient({}, {
                forgeURL: 'https://testfuse.com',
                token: 'token-token-2222'
            })
            should(httpClient.client.defaults.options.agent?.https).be.instanceOf(require('https-proxy-agent').HttpsProxyAgent)
            httpClient.client.defaults.options.agent.https.proxy.should.have.property('hostname', 'https_proxy')
            httpClient.client.defaults.options.agent.https.proxy.should.have.property('port', '4321')
            should(httpClient.client.defaults.options.agent?.http).be.undefined()
        })
    })
})
