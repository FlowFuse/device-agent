const LogBuffer = require('./logBuffer')

let buffer
let mqtt
let verbose = false

function log (msg, level) {
    const date = new Date()
    console.log(`[AGENT] ${date.toLocaleDateString()} ${date.toLocaleTimeString()} [${level || 'info'}] ${msg}`)
    const jsMsg = { level, msg }
    if (buffer) {
        buffer.add(jsMsg)
    }
    if (mqtt) {
        // publish log message
        mqtt.log(jsMsg)
    }
}

function NRlog (msg) {
    let jsMsg
    try {
        jsMsg = JSON.parse(msg)
    } catch (eee) {
        jsMsg = { ts: Date.now(), level: '', msg }
    }
    if (!Object.hasOwn(jsMsg, 'ts') && !Object.hasOwn(jsMsg, 'level')) {
        // not a NR log message
        jsMsg = { ts: Date.now(), level: '', msg }
    }
    const date = new Date(jsMsg.ts)
    if (typeof jsMsg.msg !== 'string') {
        jsMsg.msg = JSON.stringify(jsMsg.msg)
    }
    console.log(`[NR] ${date.toLocaleDateString()} ${date.toLocaleTimeString()} [${jsMsg.level || 'info'}] ${jsMsg.msg}`)
    if (buffer) {
        buffer.add(jsMsg)
    }
    if (mqtt) {
        // publish log message
        mqtt.log(jsMsg)
    }
}

function getBufferedMessages () {
    return buffer.toArray()
}

function setMQTT (mqttAgent) {
    mqtt = mqttAgent
}

module.exports = {
    initLogger: configuration => {
        verbose = configuration.verbose
        buffer = new LogBuffer(configuration.bufferSize || 1000)
    },
    info: msg => log(msg, 'info'),
    warn: msg => log(msg, 'warn'),
    error: msg => log(msg, 'error'),
    debug: msg => verbose && log(msg, 'debug'),
    log,
    NRlog,
    getBufferedMessages,
    setMQTT
}
