const { debug } = require('./logging/log')
const EventEmitter = require('events')
/**
 * An interval timer with jitter
 * @example
 * // Basic example - every 1s ± 100ms
 * const j1 = new IntervalJitter()
 * j1.start({interval: 1000, jitter: 100}, (t) => { console.log(`hello j1, this was delayed ${t}ms`) })
 * setTimeout(() => { j1.stop() }, 5000)
 * @example
 * // Custom timings example - at 1s ± 100ms, 5s ± 200ms, then every 30s ± 10ms
 * const j1 = new IntervalJitter()
 * const retryTiming = [1000, 5000, 30000] // retry at 1s, 5s, 30s, [30s, 30s, 30s..]
 * const jitterTiming = [100, 200, 10] // jitter at 100ms, 200ms, 10ms, [10ms, 10ms, 10ms..]
 * j1.start({interval: retryTiming, jitter: jitterTiming}, (t) => { console.log(`hello j1, this was delayed ${t}ms`) })
 * setTimeout(() => { j1.stop() }, 30000)
 * @example
 * const j2 = new IntervalJitter()
 * j2.on('interval', (t) => { console.log(`hello j2, this was delayed ${t}ms`) })
 * j2.on('started', () => { console.log('j2 started') })
 * j2.on('stopped', () => { console.log('j2 stopped') })
 * // Start with first "interval" firing at somewhere between 0 ~ 500ms
 * // After that, fire somewhere between 900 ~ 1100ms
 * j2.start({interval: 1000, jitter: 200, firstInterval: 0, firstJitter: 500})
 * setTimeout(() => { j2.stop() }, 5000)
 */

const DEFAULT_INTERVAL = 1000 // 1 sec
const DEFAULT_JITTER = 100 // 100 ms

class IntervalJitter extends EventEmitter {
    constructor () {
        super()
        this.interval = DEFAULT_INTERVAL
        this.jitter = DEFAULT_JITTER
        this.awaitCallback = true // if callback is async, await it before scheduleing next interval
        this.intervalArray = []
        this.jitterArray = []
        this.firstInterval = this.interval
        this.firstJitter = this.jitter
        this.callback = null
        this.#init()
    }

    #stopped = true
    #executing = false
    #counter = 0
    #initTimer
    #intervalTimer
    #init () {
        const self = this
        self.on('internal:start1', (interval, jitter) => {
            self.emit('started')
            const variance = IntervalJitter.calculateJitter(jitter)
            const firstDelay = interval + variance
            self.#initTimer = setTimeout(async () => {
                if (self.#stopped) { return }
                const now = Date.now()
                try {
                    self.#executing = true
                    self.#counter++
                    const msSinceLastCall = now - self.lastTime
                    if (typeof self.callback === 'function') {
                        if (self.awaitCallback && self.callback.constructor.name === 'AsyncFunction') {
                            await self.callback.call(this, msSinceLastCall, self.counter)
                        } else {
                            self.callback.call(this, msSinceLastCall, self.counter)
                        }
                    }
                    self.emit('interval', msSinceLastCall, self.counter)
                } finally {
                    self.#executing = false
                    self.lastTime = now
                }
                if (self.#stopped) { return }
                self.emit('internal:start2')
            }, firstDelay)
        })
        self.on('internal:start2', () => {
            if (self.#stopped) { return }
            const intervalTimer = async function () {
                const variance = IntervalJitter.calculateJitter(self.#nextJitter)
                let interval = self.#nextInterval
                interval += variance
                interval = interval < 0 ? 0 : interval
                self.#intervalTimer = setTimeout(async () => {
                    if (self.#stopped) { return }
                    const now = Date.now()
                    try {
                        self.#executing = true
                        self.#counter++
                        const msSinceLastCall = now - self.lastTime
                        if (typeof self.callback === 'function') {
                            if (self.awaitCallback && self.callback.constructor.name === 'AsyncFunction') {
                                await self.callback.call(this, msSinceLastCall, self.counter)
                            } else {
                                self.callback.call(this, msSinceLastCall, self.counter)
                            }
                        }
                        self.emit('interval', msSinceLastCall, self.counter)
                    } finally {
                        self.#executing = false
                        self.lastTime = now
                    }
                    if (self.#stopped) { return }
                    intervalTimer()
                }, interval)
            }
            intervalTimer()
        })
    }

    get #nextInterval () {
        if (this.intervalArray && this.intervalArray.length) {
            this.interval = this.intervalArray.shift()
        }
        if (typeof this.interval !== 'number') {
            this.interval = DEFAULT_INTERVAL
        }
        if (this.interval < 0) { this.interval = 0 }
        return this.interval
    }

    get #nextJitter () {
        if (this.jitterArray && this.jitterArray.length) {
            this.jitter = this.jitterArray.shift()
        }
        if (typeof this.jitter !== 'number') {
            this.jitter = DEFAULT_JITTER
        }
        if (this.jitter < 0) { this.jitter = 0 }
        return this.jitter
    }

    /** Calculate a jitter value between `0` ~ `jitter` */
    static calculateJitter = (jitter) => {
        if (typeof jitter !== 'number' || isNaN(jitter) || jitter < 0) { return 0 }
        return Math.ceil(Math.random() * jitter)
    }

    get isRunning () {
        return this.#stopped === false
    }

    get isExecuting () {
        return !!this.#executing
    }

    get counter () {
        return this.#counter
    }

    /**
    * Start the interval timer
    * @param {object} options
    * @param {number|Array<number>} options.interval - base/minimum delay. If interval is an array, it will use up all elements per execution until the last element which will become the base time for remaining executions. This is useful for generating a specific retry schedule e.g. 1s, 5s, 20s, 5m, [5m, 5m,...]
    * @param {number|Array<number>} options.jitter - jitter to apply to `interval`. If jitter is an array, it will use up all elements per execution until the last element which will become the base jitter for remaining executions. This is useful for generating a specific retry schedule e.g. 1s±5ms, 5s±25ms, 20s±2s, 5m±30s, [5m±30s, 5m±30s,...]
    * @param {number} [options.firstInterval] - base delay for first interval (optional)
    * @param {number} [options.firstJitter] - jitter to apply to `firstInterval` (optional)
    * @param {Boolean} [options.awaitCallback] - flag to instruct the timer to await callback before scheduling next interval
    * @param {(timeSinceLastExecution: number, callCount: number ) => {}} [callback] - the function to call upon timeout (optional, can use `on('interval')`)
    */
    start ({ interval, jitter, firstInterval, firstJitter, awaitCallback } = {}, callback) {
        debug('⏲️ START INTERVAL TIMER')
        const self = this
        if (!self.#stopped) { return }
        self.awaitCallback = typeof awaitCallback === 'boolean' ? awaitCallback : self.awaitCallback
        // setup
        if (typeof interval === 'number') {
            self.intervalArray = [interval]
        } else if (Array.isArray(interval) && interval.length) {
            self.intervalArray = [...interval]
        } else {
            self.intervalArray = [DEFAULT_INTERVAL]
        }
        if (typeof jitter === 'number') {
            self.jitterArray = [jitter]
        } else if (Array.isArray(jitter) && jitter.length) {
            self.jitterArray = [...jitter]
        } else {
            self.jitterArray = [DEFAULT_JITTER]
        }
        if (typeof firstInterval === 'number') {
            self.intervalArray.unshift(firstInterval)
        }
        if (typeof firstJitter === 'number') {
            self.jitterArray.unshift(firstJitter)
        }

        // some defaults
        self.interval = self.#nextInterval
        self.firstInterval = self.interval
        self.jitter = self.#nextJitter
        self.firstJitter = self.jitter
        self.#stopped = false
        self.#counter = 0
        self.lastTime = Date.now()
        if (typeof callback === 'function') { self.callback = callback }
        self.emit('internal:start1', self.firstInterval, self.firstJitter)
    }

    /** Stop the interval timer */
    stop () {
        this.#stopped = true
        debug('⏲️ STOP INTERVAL TIMER')
        clearInterval(this.#intervalTimer)
        clearInterval(this.#initTimer)
        this.emit('stopped')
    }
}

module.exports.IntervalJitter = IntervalJitter
