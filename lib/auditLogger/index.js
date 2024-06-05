/*
 * The below code should be kept in-sync with nr-launcher/lib/auditLogger/index.js
 */

const { default: GOT } = require('got')
const { HttpProxyAgent } = require('http-proxy-agent')
const { HttpsProxyAgent } = require('https-proxy-agent')

module.exports = (settings) => {
    const loggingURL = settings.loggingURL
    const token = settings.token

    const httpProxy = process.env.http_proxy ? new HttpProxyAgent(process.env.http_proxy) : undefined
    const httpsProxy = process.env.https_proxy ? new HttpsProxyAgent(process.env.https_proxy) : undefined

    const got = GOT.extend({
        agent: {
            http: httpProxy,
            https: httpsProxy
        }
    })

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
