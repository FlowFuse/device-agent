const crypto = require('crypto')
const got = require('got').default
const os = require('node:os')

let pptf
(async function () {
    try {
        pptf = (await import('parse-prometheus-text-format')).default
    } catch (err) {
        console.error(err)
    }
})()

const instanceId = crypto.createHash('md5').update(os.hostname()).digest('hex').substring(0, 4)

let lastCPUTime = 0

async function sampleResources (url, time) {
    const response = {
        src: instanceId
    }
    try {
        const res = await got.get(url, {
            headers: {
                pragma: 'no-cache',
                'Cache-Control': 'max-age=0, must-revalidate, no-cache'
            },
            timeout: { request: 2000 },
            retry: { limit: 0 }
        })
        const parsed = pptf(res.body)
        parsed.forEach(metric => {
            if (metric.name === 'process_resident_memory_bytes') {
                response.ps = parseInt(metric.metrics[0].value) / (1024 * 1024)
            } else if (metric.name === 'process_cpu_seconds_total') {
                const cpuTime = parseFloat(metric.metrics[0].value)
                if (cpuTime > lastCPUTime) {
                    if (lastCPUTime !== 0) {
                        const delta = cpuTime - lastCPUTime
                        response.cpu = (delta / time) * 100
                    }
                } else {
                    // show 0 if the CPU time has not increased
                    // this can happen if the process was restarted
                    response.cpu = 0
                }
                lastCPUTime = cpuTime
            } else if (metric.name === 'nodejs_eventloop_lag_mean_seconds') {
                response.ela = parseFloat(metric.metrics[0].value)
            } else if (metric.name === 'nodejs_eventloop_lag_p99_seconds') {
                response.el99 = parseFloat(metric.metrics[0].value)
            } else if (metric.name === 'nodered_messages_total') {
                response.nrmsgs = parseInt(metric.metrics[0].value)
            } else if (metric.name === 'nodered_node_receive_events_total') {
                response.nrrecv = parseInt(metric.metrics[0].value)
            } else if (metric.name === 'nodered_node_send_events_total') {
                response.nrsend = parseInt(metric.metrics[0].value)
            }
        })
    } catch (err) {
        response.err = err.message
    }

    return response
}

module.exports = sampleResources
