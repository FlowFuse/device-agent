class LogBuffer {
    constructor (size = 500) {
        this.size = size
        this.buffer = new Array(this.size)
        this.head = 0
        this.wrapped = false
        this.lastLogTimestamp = 0
        this.lastLogTimestampCount = 0
    }

    add (logEntry) {
        if (!logEntry.ts) {
            logEntry.ts = Date.now()
        }
        if (logEntry.ts === this.lastLogTimestamp) {
            this.lastLogTimestampCount++
        } else {
            this.lastLogTimestamp = logEntry.ts
            this.lastLogTimestampCount = 0
        }
        logEntry.ts = logEntry.ts + ('' + this.lastLogTimestampCount).padStart(4, '0')
        if (logEntry.level === 'system') {
            console.log(logEntry.msg) // eslint-disable-line no-console
        }
        this.buffer[this.head++] = logEntry
        if (this.head === this.size) {
            this.head = 0
            this.wrapped = true
        }
        return logEntry
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
}

module.exports = LogBuffer
