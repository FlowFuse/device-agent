const EventEmitter = require('events');
/**
 * An interval timer with jitter
 * @example
 * const j1 = new IntervalJitter()
 * j1.start({interval: 1000, jitter: 100}, (t) => { console.log(`hello j1, this was delayed ${t}ms`) })
 * setTimeout(() => { j1.stop() }, 5000)
 * @example
 * const j2 = new IntervalJitter()
 * j2.on('interval', (t) => { console.log(`hello j2, this was delayed ${t}ms`) })
 * j2.on('started', () => { console.log('j2 started') })
 * j2.on('stopped', () => { console.log('j2 stopped') })
 * // Start with initial "interval" firing at somewhere between 0 ~ 500ms
 * // After that, fire somewhere between 900 ~ 1100ms
 * j2.start({interval: 1000, jitter: 200, firstInterval: 0, firstJitter: 500})
 * setTimeout(() => { j2.stop() }, 5000)
 */
class IntervalJitter extends EventEmitter {
    constructor () {
        super()
        this.interval = 1000
        this.jitter = 1000
        this.firstInterval = null
        this.firstJitter = null
        this.callback = null
        this.#init()
    }
    #stopped = true
    #initTimer
    #intervalTimer
    #jitterTimer
    #init() {
        const self = this
        self.on('internal:start1', (interval, jitter) => {
            self.emit('started')
            let firstDelay = interval + IntervalJitter.calculateJitter(jitter)
            self.#initTimer = setTimeout(() => {
                if (self.#stopped) { return }
                self.callback && self.callback.call(this, firstDelay)
                self.emit('interval', firstDelay)
                self.lastTime = Date.now()
                self.emit('internal:start2', self.interval, self.jitter)
            }, firstDelay)
        })
        self.on('internal:start2', (interval, jitter) => {
            if (self.#stopped) { return }
            self.#intervalTimer = setInterval(() => {
                if (self.#stopped) { return }
                let variance = IntervalJitter.calculateJitter(jitter)
                variance = variance < 0 ? 0 : variance
                self.#jitterTimer = setTimeout(() => {
                    if (self.#stopped) { return }
                    const now = Date.now()
                    self.callback && self.callback.call(this, now - self.lastTime)
                    self.emit('interval', now - self.lastTime)
                    self.lastTime = now
                }, variance)
            }, interval)
        })
    }
    /** Calculate a jitter value between `0` ~ `jitter` */
    static calculateJitter = (jitter) => {
        if(typeof jitter !== 'number' || isNaN(jitter) || jitter < 0) { return 0 }
        return Math.ceil(Math.random() * jitter)
    }
    get isRunning () {
        return this.#stopped === false
    }
    /**
    * Start the interval timer
    * @param {object} options
    * @param {number} options.interval - base/minimum delay
    * @param {number} options.jitter - jitter to apply to `interval`
    * @param {number} [options.firstInterval] - base delay for first interval (optional)
    * @param {number} [options.firstJitter] - jitter to apply to `firstInterval` (optional)
    * @param {function} [cb] - the function to call upon timeout (optional, can use `on('interval')`)
    */
    start ( {interval, jitter, firstInterval, firstJitter} = {}, callback) {
        const self = this
        if (!self.#stopped) { return }
        if (typeof interval === 'number') { self.interval = interval }
        if (typeof jitter === 'number') { self.jitter = jitter }
        if (typeof firstInterval === 'number') { self.firstInterval = firstInterval }
        if (typeof firstJitter === 'number') { self.firstJitter = firstJitter }
        if (typeof callback === 'function') { self.callback = callback }
        self.#stopped = false
        this.emit('internal:start1', self.firstInterval, self.firstJitter)
    }
    /** Stop the interval timer */
    stop () {
        this.#stopped = true
        clearInterval(this.#jitterTimer)
        clearInterval(this.#intervalTimer)
        clearInterval(this.#initTimer)
        this.emit('stopped')
    }
}

module.exports.IntervalJitter = IntervalJitter
