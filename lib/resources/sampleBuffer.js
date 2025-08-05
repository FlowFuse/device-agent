class SampleBuffer {
    constructor (size = 1000) {
        this.size = size
        this.buffer = new Array(this.size)
        this.head = 0
        this.wrapped = false
        this.lastTimestamp = 0
        this.lastTimestampCount = 0
    }

    setMQTT (mqtt) {
        this.mqtt = mqtt
    }

    add (sample) {
        if (!sample.ts) {
            sample.ts = Date.now()
        }
        this.buffer[this.head++] = sample
        if (this.head === this.size) {
            this.head = 0
            this.wrapped = true
        }
        if (this.mqtt && this.mqtt.resourceEnabled) {
            this.mqtt.resource(sample)
        }
        return sample
    }

    clear () {
        this.buffer = new Array(this.size)
        this.head = 0
        this.wrapped = false
    }

    toArray () {
        if (!this.wrapped) {
            return this.buffer.slice(0, this.head)
        } else {
            const result = this.buffer.slice(this.head, this.size)
            result.push(...this.buffer.slice(0, this.head))
            return result
        }
    }

    lastX (x) {
        if (this.head > x) {
            return this.buffer.slice(this.head - x, this.head)
        } else {
            if (this.wrapped) {
                const d = x - this.head
                const result = this.buffer.slice(this.size - d, this.size)
                result.push(...this.buffer.slice(0, this.head))
                return result
            } else {
                return this.buffer.slice(0, this.head)
            }
        }
    }

    avgLastX (x) {
        const samples = this.lastX(x)
        const result = {}
        let skipped = 0
        samples.forEach(sample => {
            if (!sample.err) {
                for (const [key, value] of Object.entries(sample)) {
                    if (key !== 'ts' && key !== 'err') {
                        if (result[key]) {
                            result[key] += value
                        } else {
                            result[key] = value
                        }
                    }
                }
            } else {
                skipped++
            }
        })
        for (const [key, value] of Object.entries(result)) {
            result[key] = value / (samples.length - skipped)
        }
        result.count = samples.length
        return result
    }
}

module.exports = SampleBuffer
