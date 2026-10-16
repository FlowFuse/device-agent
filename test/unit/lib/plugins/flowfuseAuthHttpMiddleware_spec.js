const should = require('should')
const http = require('http')
const sinon = require('sinon')

const httpAuth = require('../../../../lib/plugins/node_modules/@flowfuse/flowfuse-auth/httpAuthMiddleware')

describe('FlowFuse auth plugin bearer token cache', function () {
    let forge, tokenChecks, clock, authMiddleware

    beforeEach(async function () {
        // A stand-in for the platform's token check endpoint that counts how often it is asked
        tokenChecks = 0
        forge = http.createServer((req, res) => {
            if (req.url.startsWith('/account/check/http:device/device-1')) {
                tokenChecks++
            }
            res.setHeader('content-type', 'application/json')
            res.end('{}')
        })
        forge.listen(0)
        await new Promise(resolve => forge.once('listening', resolve))

        authMiddleware = httpAuth.init({
            baseURL: 'http://127.0.0.1',
            forgeURL: `http://127.0.0.1:${forge.address().port}`,
            clientID: 'client-id',
            clientSecret: 'client-secret',
            teamID: 'team-1',
            deviceId: 'device-1'
        })[0]
        // Only the token check client matters here, so the routes go to a stub app
        httpAuth.setupAuthRoutes({ use () {}, get () {} })

        // Only fake Date, so the server and sockets keep working
        clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    })

    afterEach(function () {
        clock.restore()
        forge.close()
    })

    // Runs one request carrying the bearer token through the middleware and reports whether it got through
    async function request () {
        const req = { session: {}, path: '/endpoint', get: (name) => name === 'Authorization' ? 'Bearer cache-test-token' : undefined }
        const next = sinon.spy()
        await authMiddleware(req, {}, next)
        next.calledOnce.should.be.true()
        return next.firstCall.args[0]
    }

    it('rechecks an accepted token with the platform once it is a minute old', async function () {
        should(await request()).be.undefined()
        tokenChecks.should.equal(1)

        clock.tick(59 * 1000)
        should(await request()).be.undefined()
        tokenChecks.should.equal(1)

        clock.tick(2 * 1000)
        should(await request()).be.undefined()
        tokenChecks.should.equal(2)
    })
})
