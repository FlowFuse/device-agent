const LogBuffer = require('./logBuffer')

let buffer
let mqtt
let verbose = false

function log (msg, level) {
    console.log(`[AGENT] ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })} ${level || 'info'}:`, msg)
    if (buffer) {
        buffer.add({ level, msg })
    }
    if (mqtt) {
        // publish log message
        mqtt.log({ level, msg, ts: Date.now() })
    }
}

function NRlog(msg) {
    let jsMsg
    try {
        jsMsg = JSON.parse(msg)
    } catch (eee) {
        jsMsg = { ts: Date.now(), level: '', msg }
    }
    const date = new Date(jsMsg.ts)
    console.log(`[NR] ${date.toLocaleDateString()} ${date.toLocaleTimeString()} [${jsMsg.level}] ${jsMsg.msg}`)
    if (buffer) {
        buffer.add(jsMsg)
    }
    if (mqtt) {
        // publish log message
        mqtt.log(jsMsg)
    }
}

function getBufferedMessages() {
    return buffer.toArray()
}

function setMQTT(mqttAgent) {
    mqtt = mqttAgent
}

module.exports = {
    initLogger: configuration => {
        verbose = configuration.verbose
        buffer = new LogBuffer(configuration.bufferSize | 1000)
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
