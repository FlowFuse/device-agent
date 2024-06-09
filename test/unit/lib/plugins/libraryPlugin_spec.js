const mocha = require('mocha') // eslint-disable-line
const should = require('should') // eslint-disable-line
const sinon = require('sinon') // eslint-disable-line
const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
const pluginModule = require('../../../../lib/plugins/node_modules/@flowforge/flowforge-library-plugin/libraryPlugin.js')
let FFTeamLibraryPluginClass = null

// simulate RED object to capture the plugin class for performing unit tests on the internal plugin
const RED = {
    plugins: {
        registerPlugin: function (PLUGIN_TYPE_ID, plugin) {
            FFTeamLibraryPluginClass = plugin.class
        }
    }
}
pluginModule(RED)

describe('FFTeamLibraryPlugin', () => {
    it('should throw an error if projectID and applicationID are missing', () => {
        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            libraryID: 'library-id',
            token: 'token'
        }

        const expectError = 'Missing required configuration property: projectID or applicationID are required'
        try {
            new FFTeamLibraryPluginClass(config) // eslint-disable-line
            should.fail('Should have thrown a "Missing required configuration property" error')
        } catch (error) {
            should(error.message).be.eql(expectError)
        }
    })

    it('should throw an error if libraryID is missing', () => {
        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            token: 'token'
        }

        const expectError = 'Missing required configuration property: libraryID'
        try {
            new FFTeamLibraryPluginClass(config) // eslint-disable-line
            should.fail('Should have thrown a "Missing required configuration property" error')
        } catch (error) {
            should(error.message).be.eql(expectError)
        }
    })

    it('should throw an error if token is missing', () => {
        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            libraryID: 'library-id'
        }

        const expectError = 'Missing required configuration property: token'
        try {
            new FFTeamLibraryPluginClass(config) // eslint-disable-line
            should.fail('Should have thrown a "Missing required configuration property" error')
        } catch (error) {
            should(error.message).be.eql(expectError)
        }
    })

    it('should create an instance with valid configuration and no proxy', () => {
        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            libraryID: 'library-id',
            token: 'token',
            baseURL: 'https://example.com'
        }

        const plugin = new FFTeamLibraryPluginClass(config)

        should(plugin).be.instanceOf(FFTeamLibraryPluginClass)
        should(plugin.type).be.eql('flowfuse-team-library')
        should(plugin.id).be.eql('plugin-id')
        should(plugin.label).be.eql('Plugin Label')
        should(plugin._client)
        should(plugin._client.defaults).be.an.Object()
        should(plugin._client.defaults.options).be.an.Object()

        plugin._client.defaults.options.prefixUrl.should.be.eql('https://example.com/library/library-id/')
        plugin._client.defaults.options.headers['user-agent'].should.be.eql('FlowFuse HTTP Storage v0.1')
        plugin._client.defaults.options.headers.authorization.should.be.eql('Bearer token')
        plugin._client.defaults.options.timeout.request.should.be.eql(10000)
        should(plugin._client.defaults.options.agent?.http).be.undefined()
        should(plugin._client.defaults.options.agent?.https).be.undefined()
    })

    it('should extend got to use http proxy when env var http_proxy is set', () => {
        sinon.stub(process, 'env').value({
            ...process.env,
            http_proxy: 'http://http_proxy:1234',
            https_proxy: ''
        })

        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            libraryID: 'library-id',
            token: 'token',
            baseURL: 'https://example.com'
        }

        const plugin = new FFTeamLibraryPluginClass(config)
        should(plugin).be.instanceOf(FFTeamLibraryPluginClass)
        should(plugin._client.defaults.options.agent.https).be.undefined()
        plugin._client.defaults.options.agent.should.have.property('http').and.be.instanceOf(HttpProxyAgent)
        plugin._client.defaults.options.agent.http.should.have.property('proxy').and.be.an.Object()
        plugin._client.defaults.options.agent.http.proxy.should.have.property('hostname', 'http_proxy')
        plugin._client.defaults.options.agent.http.proxy.should.have.property('port', '1234')
    })

    it('should extend got to use https proxy when env var https_proxy is set', () => {
        sinon.stub(process, 'env').value({
            ...process.env,
            http_proxy: '',
            https_proxy: 'http://https_proxy:4567'
        })

        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            libraryID: 'library-id',
            token: 'token',
            baseURL: 'https://example.com'
        }

        const plugin = new FFTeamLibraryPluginClass(config)
        should(plugin).be.instanceOf(FFTeamLibraryPluginClass)
        should(plugin._client.defaults.options.agent.http).be.undefined()
        plugin._client.defaults.options.agent.should.have.property('https').and.be.instanceOf(HttpsProxyAgent)
        plugin._client.defaults.options.agent.https.should.have.property('proxy')
        plugin._client.defaults.options.agent.https.proxy.should.have.property('hostname', 'https_proxy')
        plugin._client.defaults.options.agent.https.proxy.should.have.property('port', '4567')
    })
    it('should extend got to use http & https proxies when env vars are set', () => {
        sinon.stub(process, 'env').value({
            ...process.env,
            http_proxy: 'http://https_proxy:1234',
            https_proxy: 'http://https_proxy:4567'
        })

        const config = {
            id: 'plugin-id',
            label: 'Plugin Label',
            projectID: 'project-id',
            libraryID: 'library-id',
            token: 'token',
            baseURL: 'https://example.com'
        }

        const plugin = new FFTeamLibraryPluginClass(config)
        should(plugin).be.instanceOf(FFTeamLibraryPluginClass)
        plugin._client.defaults.options.agent.should.have.property('http').and.be.instanceOf(HttpProxyAgent)
        plugin._client.defaults.options.agent.should.have.property('https').and.be.instanceOf(HttpsProxyAgent)
    })
})
