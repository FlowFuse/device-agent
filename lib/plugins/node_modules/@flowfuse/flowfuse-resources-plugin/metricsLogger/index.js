const LRUMap = require('mnemonist/lru-map')
const { Counter } = require('prom-client')

let messageCounter = null
let nodeReceiveCounter = null
let nodeSendCounter = null

function registerClient (promClientRegister) {
    messageCounter = new Counter({
        name: 'nodered_messages_total',
        help: 'Count of unique messages handled by the flows',
        registers: [promClientRegister]
    })
    nodeReceiveCounter = new Counter({
        name: 'nodered_node_receive_events_total',
        help: 'Count of node receive events',
        registers: [promClientRegister]
    })
    nodeSendCounter = new Counter({
        name: 'nodered_node_send_events_total',
        help: 'Count of node send events',
        registers: [promClientRegister]
    })
}
const logger = (settings) => {
    // Keep track of the 1000 most recently seen message ids
    // That should be sufficient to avoid counting duplicates for most cases
    const inflightMessages = new LRUMap(1000)
    let loggedError = false
    return function (msg) {
        try {
            if (messageCounter) {
                // Only listen for node events
                if (/^node/.test(msg.event)) {
                    if (!inflightMessages.has(msg.msgid)) {
                        messageCounter.inc()
                    }
                    inflightMessages.set(msg.msgid, msg.timestamp)
                    if (/\.send$/.test(msg.event)) {
                        nodeSendCounter.inc()
                    }
                    if (/\.receive$/.test(msg.event)) {
                        nodeReceiveCounter.inc()
                    }
                }
            }
            loggedError = false // Reset the error flag on successful logging
        } catch (err) {
            // If the metrics logger fails, we don't want to crash the process
            // so just log the error - but we don't want to flood the log in case
            // of a persistent error, so we only log the first error
            if (!loggedError) {
                loggedError = true
                console.error('Metrics logger error:', err)
            }
        }
    }
}

module.exports = {
    logger,
    registerClient
}
