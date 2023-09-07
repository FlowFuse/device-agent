const should = require('should')
const { IntervalJitter } = require('../../../lib/IntervalJitter')
const sinon = require('sinon')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('intervalJitter', function () {
    this.timeout(15000)

    it('can be created', async function () {
        const ij = new IntervalJitter()
        should(ij).be.an.Object()
    })

    it('can be started', async function () {
        const ij = new IntervalJitter()
        ij.start()
        should(ij).be.an.Object()
        ij.isRunning.should.be.true()
    })
    it('can be stopped', async function () {
        const ij = new IntervalJitter()
        ij.start()
        should(ij).be.an.Object()
        ij.isRunning.should.be.true()
        ij.stop()
        ij.isRunning.should.be.false()
    })
    it('executes with defaults', async function () {
        const ij = new IntervalJitter()
        const result = {
            done: false,
            counter: 0,
            time: 0
        }
        const callback = async function (time, counter) {
            sleep(25) // sleep to simulate work
            result.done = true
            result.counter = counter
            result.time = time
        }
        sinon.spy(callback)

        ij.start({}, callback)
        ij.isRunning.should.be.true()
        // sleep for 1200ms to allow callback to be called once
        // 25ms for execution of callback + 100ms default jitter + 1000ms default interval + a little extra (but less than it would take for another execution)
        await sleep(1200)

        ij.stop()

        // check results
        should(result.done).be.true()
        ij.counter.should.be.eql(1)
    })
    it('executes with single interval and jitter', async function () {
        const ij = new IntervalJitter()
        const executions = []
        const callback = async function (sinceLastExecution, counter) {
            executions.push({ counter, sinceLastExecution })
            await sleep(10) // sleep to simulate work
        }
        sinon.spy(callback)

        ij.start({ interval: 30, jitter: 10 }, callback)
        ij.isRunning.should.be.true()
        // sleep for 250ms to allow callback to be called several times
        // in 250ms, with an interval of 30ms and jitter of 10ms and a work time of 10ms (total: 50ms), we should get 4 or more calls
        await sleep(250)

        ij.stop()

        // check results
        executions.length.should.be.greaterThanOrEqual(4)
        ij.counter.should.eql(executions.length)
    })
    it('executes with defined list of interval and jitter', async function () {
        const ij = new IntervalJitter()
        const executions = []
        const startTime = Date.now()
        const callback = async function (sinceLastExecution, counter) {
            const sinceStart = Date.now() - startTime
            executions.push({ counter, sinceLastExecution, sinceStart })
            await sleep(5) // sleep to simulate work
        }
        sinon.spy(callback)

        ij.start({ interval: [30, 65, 10], jitter: [10, 20, 5] }, callback)
        ij.isRunning.should.be.true()
        // sleep for 245ms to allow callback to be called several times
        // in 245ms, with an interval of 30ms and jitter of 10ms and a work time of 10ms, we should get 4 calls min
        await sleep(255)

        ij.stop()
        const GRACE = 30 // grace period for callbacks + work-time + non-deterministic execution (in the ball park)
        // check results
        executions.length.should.be.greaterThanOrEqual(5)
        executions[0].counter.should.be.eql(1)
        executions[0].sinceLastExecution.should.be.greaterThanOrEqual(30)
        executions[0].sinceLastExecution.should.be.lessThanOrEqual(30 + 10 + GRACE)
        executions[0].sinceStart.should.be.greaterThanOrEqual(30)

        executions[1].counter.should.be.eql(2)
        executions[1].sinceLastExecution.should.be.greaterThanOrEqual(65)
        executions[1].sinceLastExecution.should.be.lessThanOrEqual(65 + 20 + GRACE)
        executions[1].sinceStart.should.be.greaterThanOrEqual(executions[0].sinceStart + 65)

        executions[2].counter.should.be.eql(3)
        executions[2].sinceLastExecution.should.be.greaterThanOrEqual(10)
        executions[2].sinceLastExecution.should.be.lessThanOrEqual(10 + 5 + GRACE)
        executions[2].sinceStart.should.be.greaterThanOrEqual(executions[1].sinceStart + 10)

        // all executions from here on should be the same as the last
        executions[3].counter.should.be.eql(4)
        executions[3].sinceLastExecution.should.be.greaterThanOrEqual(10)
        executions[3].sinceLastExecution.should.be.lessThanOrEqual(10 + 5 + GRACE)
        executions[3].sinceStart.should.be.greaterThanOrEqual(executions[2].sinceStart + 10)

        ij.counter.should.be.equal(executions.length)
    })
})
