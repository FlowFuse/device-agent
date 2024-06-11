const mocha = require('mocha') // eslint-disable-line
const sinon = require('sinon')
const should = require('should')
const { HttpProxyAgent } = require('http-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')
const rewire = require('rewire')

describe('auditLogger', () => {
    function setup (settings) {
        const module = rewire('../../../../lib/auditLogger/index.js')
        const logger = module(settings)
        sinon.stub(module.__get__('got'), 'post').resolves()
        return { module, logger }
    }
    afterEach(() => {
        sinon.restore()
    })

    it('should send log message to the logging URL', () => {
        const settings = {
            loggingURL: 'https://example.com/logs',
            token: 'my-token'
        }
        const logMessage = {
            event: 'test-event',
            user: {
                userId: 'test-user-id'
            },

            message: 'Test log message'
        }

        const { module, logger } = setup(settings)
        logger(logMessage)

        const got = module.__get__('got')
        got.post.calledOnce.should.be.true()
        got.post.calledWith('https://example.com/logs', {
            json: logMessage,
            responseType: 'json',
            headers: {
                'user-agent': 'FlowFuse Device Agent Audit Logging v0.1',
                authorization: 'Bearer my-token'
            }
        }).should.be.true()
    })

    it('should ignore comms events and any .get events', () => {
        const settings = {
            loggingURL: 'https://example.com/logs',
            token: 'my-token'
        }
        const logMessage1 = {
            event: 'comms.event',
            user: {
                userId: 'test-user-id'
            },

            message: 'Test log message'
        }
        const logMessage2 = {
            event: 'data.get',
            user: {
                userId: 'test-user-id'
            },

            message: 'Test log message'
        }
        const { module, logger } = setup(settings)
        const got = module.__get__('got')

        logger(logMessage1)
        logger(logMessage2)

        got.post.called.should.be.false()
    })

    it('should ignore auth events except auth.log events', () => {
        const settings = {
            loggingURL: 'https://example.com/logs',
            token: 'my-token'
        }
        const logMessage1 = {
            event: 'auth.event',
            user: {
                userId: 'test-user-id'
            },

            message: 'Test log message'
        }
        const logMessage2 = {
            event: 'auth.log.event',
            user: {
                userId: 'test-user-id'
            },

            message: 'Test log message'
        }
        const { module, logger } = setup(settings)
        logger(logMessage1)
        logger(logMessage2)

        const got = module.__get__('got')
        got.post.calledOnce.should.be.true()
        got.post.calledWith('https://example.com/logs', {
            json: logMessage2,
            responseType: 'json',
            headers: {
                'user-agent': 'FlowFuse Device Agent Audit Logging v0.1',
                authorization: 'Bearer my-token'
            }
        }).should.be.true()
    })

    it('should remove username and level properties from the log message', () => {
        const settings = {
            loggingURL: 'https://example.com/logs',
            token: 'my-token'
        }
        const logMessage = {
            event: 'test-event',
            user: {
                userId: 'test-user-id'
            },
            username: 'test-username',
            level: 'info',
            message: 'Test log message'
        }

        const { module, logger } = setup(settings)
        logger(logMessage)

        const got = module.__get__('got')
        got.post.calledOnce.should.be.true()
        got.post.calledWith('https://example.com/logs', {
            json: {
                event: 'test-event',
                user: 'test-user-id',
                message: 'Test log message'
            },
            responseType: 'json',
            headers: {
                'user-agent': 'FlowFuse Device Agent Audit Logging v0.1',
                authorization: 'Bearer my-token'
            }
        }).should.be.true()
    })
    describe('Proxy support', () => {
        afterEach(() => {
            delete process.env.http_proxy
            delete process.env.https_proxy
            delete process.env.no_proxy
        })
        it('should not have a proxy if env vars are not set', () => {
            const settings = {
                loggingURL: 'https://example.com/logs',
                token: 'my-token'
            }
            const logMessage = {
                event: 'test-event',
                user: {
                    userId: 'test-user-id'
                },
                message: 'Test log message'
            }
            process.env.http_proxy = ''
            process.env.https_proxy = ''

            const { module, logger } = setup(settings)
            logger(logMessage)

            const got = module.__get__('got')
            got.post.calledOnce.should.be.true()
            should.not.exist(got.defaults.options.agent?.http)
            should.not.exist(got.defaults.options.agent?.https)
        })

        it('should use HTTP proxy agent if http_proxy environment variable is set', () => {
            const settings = {
                loggingURL: 'http://example.com/logs',
                token: 'my-token'
            }
            process.env.http_proxy = 'http://localhost:1234'
            const { module, logger } = setup(settings)
            const got = module.__get__('got')
            logger({ event: 'test-event', message: 'Test log message' })

            got.post.calledOnce.should.be.true()
            should(got.defaults.options.agent.http).be.instanceOf(HttpProxyAgent)
            got.defaults.options.agent.http.proxy.should.have.property('hostname', 'localhost')
            got.defaults.options.agent.http.proxy.should.have.property('port', '1234')
            should.not.exist(got.defaults.options.agent.https)
        })

        it('should use HTTPS proxy agent if https_proxy environment variable is set', () => {
            const settings = {
                loggingURL: 'https://example.com/logs',
                token: 'my-token'
            }

            process.env.https_proxy = 'http://localhost:4567'

            const { module, logger } = setup(settings)
            logger({ event: 'test-event', message: 'Test log message' })

            const got = module.__get__('got')
            got.post.calledOnce.should.be.true()
            should(got.defaults.options.agent.https).be.instanceOf(HttpsProxyAgent)
            got.defaults.options.agent.https.proxy.should.have.property('hostname', 'localhost')
            got.defaults.options.agent.https.proxy.should.have.property('port', '4567')
            should.not.exist(got.defaults.options.agent.http)
        })
    })
})
