const mocha = require('mocha') // eslint-disable-line
const should = require('should')
const sinon = require('sinon')
const rewire = require('rewire')
const { newLauncher } = require('../../../lib/launcher')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const setup = require('../setup')
const { default: got } = require('got')
const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent

describe('template-settings', () => {
    /** @type {sinon.SinonSandbox} */
    let sandbox
    let settingsFilePath
    let projectPath
    const config = {
        forgeURL: 'https://forge.flowfuse.io',
        credentialSecret: 'secret',
        port: 1880,
        dir: '',
        verbose: true
    }
    async function generateSettingsFile (_config) {
        _config = Object.assign({}, config, _config)
        const launcher = newLauncher({ config: _config }, null, 'PROJECTID', setup.snapshot)
        await launcher.writeSettings()
        settingsFilePath = path.join(config.dir, 'project', 'settings.js')
        return settingsFilePath
    }
    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        // shush the console
        sandbox.stub(console, 'log')
        config.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        projectPath = path.join(config.dir, 'project')
        await fs.mkdir(projectPath)
        // since we will be loading the generated template+settings, we need to simlink the
        // node_modules to the project directory (so it can pick up ant requires in the settings.js file)
        await fs.symlink(path.join(__dirname, '..', '..', '..', 'node_modules'), path.join(projectPath, 'node_modules'), 'dir')
    })

    afterEach(async function () {
        sandbox.restore()
        try {
            await fs.rm(config.dir, { recursive: true, force: true })
        } catch (_error) {
        }
    })

    it('should load default settings', async function () {
        const settingsFile = await generateSettingsFile()
        const settings = require(settingsFile)
        should.exist(settings)
        settings.should.have.a.property('adminAuth').and.be.an.Object()
        settings.adminAuth.should.have.a.property('type', 'credentials')
        settings.adminAuth.should.have.a.property('users').and.be.a.Function()
        settings.adminAuth.should.have.a.property('authenticate').and.be.a.Function()
        settings.adminAuth.should.have.a.property('tokens').and.be.a.Function()

        settings.should.have.a.property('contextStorage').and.be.an.Object()
        settings.contextStorage.should.have.a.property('default', 'memory')
        settings.contextStorage.should.have.a.property('memory').and.be.an.Object()
        settings.contextStorage.memory.should.have.a.property('module', 'memory')
        settings.contextStorage.should.have.a.property('persistent').and.be.an.Object()
        settings.contextStorage.persistent.should.have.a.property('module', 'localfilesystem')

        settings.should.have.a.property('credentialSecret', 'secret')
        settings.should.have.a.property('disableEditor', false)

        settings.should.have.a.property('editorTheme').and.be.an.Object()
        settings.editorTheme.theme.should.equal('forge-light')
        settings.editorTheme.should.have.a.property('codeEditor').and.be.an.Object()
        settings.editorTheme.codeEditor.should.have.a.property('lib', 'monaco')
        settings.editorTheme.tours.should.be.false()
        settings.editorTheme.should.have.a.property('palette').and.be.an.Object()

        settings.should.have.a.property('externalModules').and.be.an.Object()
        settings.externalModules.should.have.a.property('autoInstall', true)
        settings.externalModules.should.have.a.property('palette').and.be.an.Object()
        settings.externalModules.palette.should.have.a.property('allowInstall', true)
        settings.externalModules.should.have.a.property('modules').and.be.an.Object()
        settings.externalModules.modules.should.have.a.property('allowInstall', true)

        settings.should.have.a.property('flowFile', 'flows.json')

        settings.should.have.a.property('flowforge').and.be.an.Object()
        settings.flowforge.should.have.a.property('auditLogger').and.be.an.Object()
        settings.flowforge.auditLogger.should.have.a.property('bin')
        settings.flowforge.auditLogger.should.have.a.property('url')
        settings.flowforge.should.have.a.property('projectID', 'PROJECTID')

        settings.should.have.a.property('forge-light').and.be.an.Object()
        settings['forge-light'].should.have.a.property('projectURL').and.be.a.String()

        settings.should.have.a.property('httpAdminRoot', 'device-editor')
        settings.should.have.a.property('httpNodeCors').and.be.an.Object()
        settings.httpNodeCors.should.have.a.property('origin', '*')
        settings.httpNodeCors.should.have.a.property('methods', 'GET,PUT,POST,DELETE')
        settings.should.have.a.property('uiHost', '0.0.0.0')
        settings.should.have.a.property('uiPort', 1880)

        settings.should.have.a.property('logging').and.be.an.Object()
        settings.logging.should.have.a.property('auditLogger').and.be.an.Object()
        settings.logging.auditLogger.should.have.a.property('audit', true)
        settings.logging.auditLogger.should.have.a.property('handler').and.be.a.Function()
        settings.logging.auditLogger.should.have.a.property('level', 'off')
        settings.logging.auditLogger.should.have.a.property('loggingURL')
        settings.logging.auditLogger.should.have.a.property('token')

        settings.logging.should.have.a.property('console').and.be.an.Object()
        settings.logging.console.should.have.a.property('level', 'info')
        settings.logging.console.should.have.a.property('metric', false)
        settings.logging.console.should.have.a.property('audit', false)
        settings.logging.console.should.have.a.property('handler').and.be.a.Function()
        settings.should.have.a.property('nodesDir', null)
    })

    it('should call got.get with the correct parameters when verifying token', async function () {
        const settingsFile = await generateSettingsFile()
        const settings = rewire(settingsFile) // using rewire instead of require so we can access internal variables
        should.exist(settings)

        // normally got is loaded the first time tokens() is called but for test purposes we
        // need to load it here first so that we can stub the get method
        /** @type {import('got').default} */
        const _got = got.extend({})
        settings.__set__('got', _got) // update the internal got instance with this one
        sandbox.stub(_got, 'get').resolves({ body: JSON.stringify({ username: 'test', permissions: ['read'] }) })

        await settings.adminAuth.tokens('ffde_123456')

        _got.get.calledOnce.should.be.true()
        _got.get.calledWith(`${settings.flowforge.forgeURL}/api/v1/devices/123456/editor/token`, {
            timeout: { request: 2000 },
            headers: {
                'user-agent': 'FlowFuse Device Agent Node-RED admin auth',
                'x-access-token': 'ffde_123456'
            }
        }).should.be.true()
    })

    it('should cache the token verification result for subsequent calls within 30 seconds', async function () {
        const settingsFile = await generateSettingsFile()
        const settings = rewire(settingsFile) // using rewire instead of require so we can access internal variables
        should.exist(settings)

        // normally got is loaded the first time tokens() is called but for test purposes we
        // need to load it here first so that we can stub the get method
        /** @type {import('got').default} */
        const _got = got.extend({})
        settings.__set__('got', _got) // update the internal got instance with this one
        sandbox.stub(_got, 'get').resolves({ body: JSON.stringify({ username: 'test', permissions: ['read'] }) })

        await settings.adminAuth.tokens('ffde_123456')
        await settings.adminAuth.tokens('ffde_123456')
        await settings.adminAuth.tokens('ffde_123456')

        _got.get.calledOnce.should.be.true()
    })

    it.skip('should not cache invalid token', async function () {
        // TODO: Implement test
    })

    it.skip('should return without hitting cache or API if the token is not valid', async function () {
        // TODO: Implement test
    })

    it.skip('should return null for the users function', async function () {
        // TODO: Implement test
    })

    it.skip('should return null for the authenticate function', async function () {
        // TODO: Implement test
    })

    it.skip('should set the https options if provided', async function () {
        // TODO: Implement test
    })

    it.skip('should set the httpStatic option if provided', async function () {
        // TODO: Implement test
    })

    describe('Proxy Support', function () {
        afterEach(async function () {
            // clear any proxy settings
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            delete process.env.all_proxy
        })

        it('should not extend got when env vars http(s)_proxy are not set', async function () {
            process.env.http_proxy = ''
            process.env.https_proxy = ''

            const settingsFile = await generateSettingsFile()
            const settings = rewire(settingsFile) // using rewire instead of require so we can access internal variables
            should.exist(settings)

            // normally got is loaded the first time tokens() is called but for test purposes we
            // need to load it here first so that we can stub the get method
            /** @type {import('got').default} */
            const _got = got.extend({})
            settings.__set__('got', _got) // update the internal got instance with this one
            sandbox.stub(_got, 'get').resolves({ body: JSON.stringify({ username: 'test', permissions: ['read'] }) })

            await settings.adminAuth.tokens('ffde_123456')

            _got.get.calledOnce.should.be.true()
            should(_got.defaults.options.agent).be.undefined()
        })

        it('should extend got to use http proxy when env var http_proxy is set', async function () {
            // since got gets extended when tokens() is called and a http_proxy is set in the env
            // we need to increase the timeout for this test. Reason being that got.extend replaces
            // the got instance so pre-initialising it and stubbing the get method does not work!
            // Instead, we have to call it twice and let the first call simply fail then when it
            // returns, we can stub the get method and try again
            this.timeout(5000) // template-settings.js tokens() has a 2000ms timeout

            process.env.http_proxy = 'http://localhost:1234'
            process.env.https_proxy = ''

            const settingsFile = await generateSettingsFile({ forgeURL: 'http://localhost:9876' })
            const settings = rewire(settingsFile) // using rewire instead of require so we can access internal variables
            should.exist(settings)

            await settings.adminAuth.tokens('ffde_123456') // first call initializes got - this WILL timeout

            // now we can stub the get method and try again
            const extendedGot = settings.__get__('got')
            sandbox.stub(extendedGot, 'get').resolves({ body: JSON.stringify({ username: 'test', permissions: ['read'] }) })
            await settings.adminAuth.tokens('ffde_123456')

            extendedGot.get.calledOnce.should.be.true()
            should(extendedGot.defaults.options.agent?.http).be.instanceOf(HttpProxyAgent)
            extendedGot.defaults.options.agent.http.should.have.property('proxy').and.be.an.Object()
            extendedGot.defaults.options.agent.http.proxy.should.have.property('hostname', 'localhost')
            extendedGot.defaults.options.agent.http.proxy.should.have.property('port', '1234')
            should(extendedGot.defaults.options.agent?.https).be.undefined()
        })

        it('should extend got to use https proxy when env var https_proxy is set', async function () {
            // since got gets extended when tokens() is called and a https_proxy is set in the env
            // we need to increase the timeout for this test. Reason being that got.extend replaces
            // the got instance so pre-initialising it and stubbing the get method does not work!
            // Instead, we have to call it twice and let the first call simply fail then when it
            // returns, we can stub the get method and try again
            this.timeout(5000) // template-settings.js tokens() has a 2000ms timeout

            process.env.http_proxy = ''
            process.env.https_proxy = 'http://localhost:7654'

            const settingsFile = await generateSettingsFile()
            const settings = rewire(settingsFile) // using rewire instead of require so we can access internal variables
            should.exist(settings)

            await settings.adminAuth.tokens('ffde_123456') // first call initializes got - this WILL timeout

            // now we can stub the get method and try again
            const extendedGot = settings.__get__('got')
            sandbox.stub(extendedGot, 'get').resolves({ body: JSON.stringify({ username: 'test', permissions: ['read'] }) })
            await settings.adminAuth.tokens('ffde_123456')

            extendedGot.defaults.options.agent.should.have.property('https')
            should(extendedGot.defaults.options.agent?.https).be.instanceOf(HttpsProxyAgent)
            extendedGot.defaults.options.agent.https.should.have.property('proxy')
            extendedGot.defaults.options.agent.https.proxy.should.have.property('hostname', 'localhost')
            extendedGot.defaults.options.agent.https.proxy.should.have.property('port', '7654')
            should(extendedGot.defaults.options.agent?.http).be.undefined()
        })
    })
})
