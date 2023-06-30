const sleep = require('util').promisify(setTimeout)

const should = require('should') // eslint-disable-line
const Log = require('../../../../lib/logging/log')

describe('Log', function () {
    describe('Buffered messages', function () {
        const mqttMessages = []
        const mockMqttAgent = {
            log: (msg) => {
                mqttMessages.push(msg)
            }
        }
        before(() => {
            Log.initLogger({ bufferSize: 5 })
            Log.setMQTT(mockMqttAgent)
        })

        it('stores correct number of previous log messages', async function () {
            // Send 6 logs - mix of agent and nr
            Log.info('m1')
            Log.info('m2')
            Log.info('m3')
            Log.info('m4')
            await sleep(10)
            Log.NRlog(JSON.stringify({
                level: 'info',
                ts: Date.now(),
                msg: 'm5'
            }))
            Log.info('m6')
            Log.NRlog(JSON.stringify({
                level: 'info',
                ts: Date.now(),
                msg: 'm7'
            }))

            const bufferedMessages = Log.getBufferedMessages()
            // Verify we buffered the last 5
            bufferedMessages.should.have.length(5)
            bufferedMessages[0].should.have.property('msg', 'm3')
            bufferedMessages[4].should.have.property('msg', 'm7')
            const parseTS = (ts) => {
                // 16881274135850002
                (typeof ts).should.equal('string')
                ts.should.have.length(17)
                const time = parseInt(ts.substring(0, 13))
                const index = parseInt(ts.substring(13))
                return { time, index }
            }

            // Verify all of the ts properties increment as expected
            let currentTs = parseTS(bufferedMessages[0].ts)
            for (let i = 1; i < 5; i++) {
                const nextTs = parseTS(bufferedMessages[i].ts)
                if (currentTs.time === nextTs.time) {
                    nextTs.index.should.equal(currentTs.index + 1)
                } else {
                    nextTs.index.should.equal(0)
                }
                currentTs = nextTs
            }
        })
    })
})
