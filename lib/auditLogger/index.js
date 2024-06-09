/*
 * The below code should be kept in-sync with nr-launcher/lib/auditLogger/index.js
 */

const { default: GOT } = require('got')

const getProxyAgent = () => {
    const agent = {}
    if (process.env.http_proxy) {
        const HttpAgent = require('http-proxy-agent').HttpProxyAgent
        agent.http = new HttpAgent(process.env.http_proxy, { timeout: 2000 })
    }
    if (process.env.https_proxy) {
        const HttpsAgent = require('https-proxy-agent').HttpsProxyAgent
        agent.https = new HttpsAgent(process.env.https_proxy, { timeout: 2000 })
    }
    return agent
}

const got = GOT.extend({
    agent: getProxyAgent()
})

module.exports = (settings) => {
    const loggingURL = settings.loggingURL
    const token = settings.token

    const logger = function (msg) {
        if (/^(comms\.|.*\.get$)/.test(msg.event)) {
            // Ignore comms events and any .get event that is just reading data
            return
        }
        if (/^auth/.test(msg.event) && !/^auth.log/.test(msg.event)) {
            return
        }
        if (msg.user) {
            msg.user = msg.user.userId
        }
        delete msg.username
        delete msg.level
        got.post(loggingURL, {
            json: msg,
            responseType: 'json',
            headers: {
                'user-agent': 'FlowFuse Device Agent Audit Logging v0.1',
                authorization: 'Bearer ' + token
            }
        }).catch(err => {
            // ignore errors for now
            console.log(err)
        })
    }

    return logger
}
