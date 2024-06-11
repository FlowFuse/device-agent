const should = require('should') // eslint-disable-line
const utils = require('../../../lib/utils.js')

/*
    Ensure utils used throughout agent are tested
    * compareNodeRedData,
    * compareObjects,
    * isObject,
    * hasProperty
*/
describe('utils', function () {
    describe('isObject', function () {
        it('should return true for objects', function () {
            utils.isObject({}).should.be.true()
            utils.isObject({ a: 1 }).should.be.true()
            utils.isObject(new Date()).should.be.true()
        })
        it('should return false for non-objects', function () {
            utils.isObject(null).should.be.false()
            utils.isObject(undefined).should.be.false()
            utils.isObject('string').should.be.false()
            utils.isObject(1).should.be.false()
            utils.isObject(true).should.be.false()
            utils.isObject(false).should.be.false()
        })
    })
    describe('hasProperty', function () {
        it('should return true for objects with property', function () {
            utils.hasProperty({ a: 1 }, 'a').should.be.true()
            utils.hasProperty({ a: undefined }, 'a').should.be.true()
            utils.hasProperty({ a: null }, 'a').should.be.true()
            utils.hasProperty({ a: false }, 'a').should.be.true()
            utils.hasProperty({ a: true }, 'a').should.be.true()
            utils.hasProperty({ a: 0 }, 'a').should.be.true()
        })
        it('should return false for objects without property', function () {
            utils.hasProperty({}, 'a').should.be.false()
            utils.hasProperty({ a: 1 }, 'b').should.be.false()
        })
        it('should return false for non-objects', function () {
            utils.hasProperty(null, 'a').should.be.false()
            utils.hasProperty(undefined, 'a').should.be.false()
            utils.hasProperty('string', 'a').should.be.false()
            utils.hasProperty(1, 'a').should.be.false()
            utils.hasProperty(true, 'a').should.be.false()
            utils.hasProperty(false, 'a').should.be.false()
        })
    })
    describe('compareObjects', function () {
        it('should return true for equal objects', function () {
            utils.compareObjects({ a: 1 }, { a: 1 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { a: 1, b: 2 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { b: 2, a: 1 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }).should.be.false()
            utils.compareObjects(null, null).should.be.true()
        })
        it('should return false for non-objects', function () {
            utils.compareObjects(undefined, undefined).should.be.false() // equal, but not not objects
            utils.compareObjects(null, undefined).should.be.false()
            utils.compareObjects(undefined, null).should.be.false()
            utils.compareObjects('string', 'string').should.be.false() // equal, but not not objects
            utils.compareObjects('string', null).should.be.false()
            utils.compareObjects(null, 'string').should.be.false()
            utils.compareObjects(1, 1).should.be.false() // equal, but not not objects
            utils.compareObjects(0, null).should.be.false() // == but not === and 0 is not an object
            utils.compareObjects(null, 1).should.be.false()
            utils.compareObjects(true, true).should.be.false() // equal, but not not objects
            utils.compareObjects(true, null).should.be.false()
            utils.compareObjects(null, true).should.be.false()
            utils.compareObjects(false, false).should.be.false() // equal, but not not objects
            utils.compareObjects(false, null).should.be.false()
            utils.compareObjects(null, false).should.be.false()
        })
    })
    describe('compareNodeRedData', function () {
        it('should return true for equal objects. flows + modules', function () {
            const nrd1 = { flows: [{ id: '1' }, { id: '2' }], modules: { 'node-red': 'latest' } }
            const nrd2 = { flows: [{ id: '1' }, { id: '2' }], modules: { 'node-red': 'latest' } }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return true for equal objects. flows', function () {
            const nrd1 = { flows: [{ id: '1' }, { id: '2' }] }
            const nrd2 = { flows: [{ id: '1' }, { id: '2' }] }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return true for equal objects. modules', function () {
            const nrd1 = { modules: { 'node-red': 'latest' } }
            const nrd2 = { modules: { 'node-red': 'latest' } }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return false for unequal flows', function () {
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: [{ id: '2' }] }).should.be.false()
            utils.compareNodeRedData({ flows: [] }, { flows: [{ id: '3' }] }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: [] }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: null }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: undefined }).should.be.false()
        })
        it('should return false for unequal modules', function () {
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: { 'node-red': '3.0.0' } }).should.be.false()
            utils.compareNodeRedData({ modules: {} }, { modules: { 'node-red': '3.0.2' } }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: {} }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: null }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: undefined }).should.be.false()
        })
    })

    describe('getWSProxyAgent', function () {
        const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
        const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
        afterEach(function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
        })
        it('should return null when there are no env vars set', function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            should(utils.getWSProxyAgent('ws://test.com')).be.null()
            should(utils.getWSProxyAgent('wss://test.com')).be.null()
        })
        it('should not proxy any requests if they are excluded by no_local', function () {
            process.env.http_proxy = 'http://proxy:3128'
            process.env.https_proxy = 'http://proxy:3128'
            process.env.no_proxy = 'test.com'
            should(utils.getWSProxyAgent('ws://test.com')).be.null()
            should(utils.getWSProxyAgent('wss://test.com')).be.null()
            process.env.http_proxy = 'http://proxy:3128'
            process.env.https_proxy = 'http://proxy:3128'
            process.env.no_proxy = '192.168.0.100'
            should(utils.getWSProxyAgent('ws://192.168.0.100')).be.null()
            should(utils.getWSProxyAgent('wss://192.168.0.100')).be.null()
        })
        it('should return a HttpProxyAgent when http_proxy is set and the URL is ws://', function () {
            const url = 'ws://test.com'
            process.env.http_proxy = 'http://proxy:3128'
            process.env.https_proxy = ''
            const agent = utils.getWSProxyAgent(url)
            should(agent).be.instanceOf(HttpProxyAgent)
            agent.should.have.property('proxy')
            agent.proxy.should.have.property('hostname', 'proxy')
            agent.proxy.should.have.property('port', '3128')
        })
        it('should return a HttpsProxyAgent when https_proxy is set and the URL is wss://', function () {
            const url = 'wss://test.com'
            process.env.http_proxy = ''
            process.env.https_proxy = 'http://proxy:3128'
            const agent = utils.getWSProxyAgent(url)
            should(agent).be.instanceOf(HttpsProxyAgent)
            agent.should.have.property('proxy')
            agent.proxy.should.have.property('hostname', 'proxy')
            agent.proxy.should.have.property('port', '3128')
        })
        it('should set http proxy options', function () {
            const url = 'ws://test.com'
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = ''
            const agent = utils.getWSProxyAgent(url, { timeout: 3210 })
            agent.connectOpts.should.have.property('timeout', 3210)
        })
        it('should set https proxy options', function () {
            const url = 'wss://test.com'
            process.env.http_proxy = ''
            process.env.https_proxy = 'https://proxy:8080'
            const agent = utils.getWSProxyAgent(url, { timeout: 4444 })
            agent.connectOpts.should.have.property('timeout', 4444)
        })
    })
    describe('getHTTPProxyAgent', function () {
        const HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent
        const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent

        afterEach(function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
        })

        it('should return an agent object without any http or https proxy when env vars are not set', function () {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
            const agent1 = utils.getHTTPProxyAgent('http://127.0.0.1')
            agent1.should.not.have.property('http')
            agent1.should.not.have.property('https')
            const agent2 = utils.getHTTPProxyAgent('http://localhost:3000')
            agent2.should.not.have.property('http')
            agent2.should.not.have.property('https')
            const agent3 = utils.getHTTPProxyAgent('http://testfuse.com')
            agent3.should.not.have.property('http')
            agent3.should.not.have.property('https')

            const agent4 = utils.getHTTPProxyAgent('https://127.0.0.1')
            agent4.should.not.have.property('http')
            agent4.should.not.have.property('https')
            const agent5 = utils.getHTTPProxyAgent('https://localhost:3000')
            agent5.should.not.have.property('http')
            agent5.should.not.have.property('https')
            const agent6 = utils.getHTTPProxyAgent('https://testfuse.com')
            agent6.should.not.have.property('http')
            agent6.should.not.have.property('https')
        })

        it('should not proxy any requests if they are excluded by no_local', function () {
            // http requests
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = 'http://proxy:8080'
            process.env.no_proxy = 'testfuse.com,googoo.com,.parent-domain.org' // direct connection to testfuse.com, googoo.com, and any subdomain of parent-domain.org, otherwise use proxy
            const agent1 = utils.getHTTPProxyAgent('http://testfuse.com:3000')
            agent1.should.not.have.property('http')
            agent1.should.not.have.property('https')
            const agent2 = utils.getHTTPProxyAgent('http://googoo.com:3000')
            agent2.should.not.have.property('http')
            agent2.should.not.have.property('https')
            const agent3 = utils.getHTTPProxyAgent('http://sub.parent-domain.org:3000')
            agent3.should.not.have.property('http')
            agent3.should.not.have.property('https')
            const agent4 = utils.getHTTPProxyAgent('http://some-external.com')
            agent4.should.have.property('http').instanceOf(HttpProxyAgent)
            agent4.http.should.have.property('proxy')
            agent4.http.proxy.should.have.property('hostname', 'proxy')
            agent4.http.proxy.should.have.property('port', '8080')
            // https requests
            const agent5 = utils.getHTTPProxyAgent('https://testfuse.com:3000')
            agent5.should.not.have.property('http')
            agent5.should.not.have.property('https')
            const agent6 = utils.getHTTPProxyAgent('https://googoo.com:3000')
            agent6.should.not.have.property('http')
            agent6.should.not.have.property('https')
            const agent7 = utils.getHTTPProxyAgent('https://sub.parent-domain.org:3000')
            agent7.should.not.have.property('http')
            agent7.should.not.have.property('https')
            const agent8 = utils.getHTTPProxyAgent('https://some-external.com')
            agent8.should.have.property('https').instanceOf(HttpsProxyAgent)
            agent8.https.should.have.property('proxy')
            agent8.https.proxy.should.have.property('hostname', 'proxy')
            agent8.https.proxy.should.have.property('port', '8080')
        })

        it('should return an agent object with http property when http_proxy is set and no_proxy is not in scope', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = ''
            process.env.no_proxy = 'random.com' // direct connection to random.com, otherwise use proxy
            const agent = utils.getHTTPProxyAgent('http://testfuse.com:3000')
            agent.should.have.property('http').instanceOf(HttpProxyAgent)
            agent.http.should.have.property('proxy')
            agent.http.proxy.should.have.property('hostname', 'proxy')
            agent.http.proxy.should.have.property('port', '8080')
        })
        it('should return an agent object with http property when http_proxy is set', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = ''
            process.env.no_proxy = 'random.com'
            const agent = utils.getHTTPProxyAgent('http://127.0.0.1')
            agent.should.have.property('http').instanceOf(HttpProxyAgent)
            agent.http.should.have.property('proxy')
            agent.http.proxy.should.have.property('hostname', 'proxy')
            agent.http.proxy.should.have.property('port', '8080')
        })
        it('should return an agent object with https property when https_proxy is set', function () {
            process.env.http_proxy = ''
            process.env.https_proxy = 'http://proxy:8080'
            const agent = utils.getHTTPProxyAgent('https://testfuse.com:3000')
            agent.should.have.property('https').instanceOf(HttpsProxyAgent)
            agent.https.should.have.property('proxy')
            agent.https.proxy.should.have.property('hostname', 'proxy')
            agent.https.proxy.should.have.property('port', '8080')
        })
        it('should set http proxy options', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = 'http://proxy:8081'
            const agent = utils.getHTTPProxyAgent('http://127.0.0.1:3000', { timeout: 2345 })
            agent.http.connectOpts.should.have.property('timeout', 2345)
        })
        it('should set https proxy options', function () {
            process.env.http_proxy = 'http://proxy:8080'
            process.env.https_proxy = 'http://proxy:8081'
            const agent = utils.getHTTPProxyAgent('https://127.0.0.1:3000', { timeout: 2345 })
            agent.https.connectOpts.should.have.property('timeout', 2345)
        })
    })
})
