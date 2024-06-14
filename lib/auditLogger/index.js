/*
 * The below code should be kept in-sync with nr-launcher/lib/auditLogger/index.js
 * NOTE: The proxy agent is specific to the device-agent at this time
 */

const { default: GOT } = require('got')

/**
 * Get proxy agent for HTTP or HTTPS got instance. This should be applied to the `agent` property of the got instance options
 *
 * NOTE: This utility function is specifically designed for the GOT instances where the proxy is set based on the `url`
 *       that the instance will use to make requests. As such, the proxy URL is determined based on the `httpEndPoint` provided
 *       in conjunction with env vars `http_proxy`, `https_proxy` and `no_proxy`.
 * @param {String} url - http or https URL
 * @param {import('http').AgentOptions} proxyOptions - proxy options
 * @returns {{http: import('http-proxy-agent').HttpProxyAgent | undefined, https: import('https-proxy-agent').HttpsProxyAgent | undefined}}
 */
function getHTTPProxyAgent (url, proxyOptions) {
    const agent = {}
    if (url) {
        const _url = new URL(url)
        const proxyFromEnv = require('proxy-from-env')
        const proxyUrl = proxyFromEnv.getProxyForUrl(url)
        if (proxyUrl && _url.protocol === 'http:') {
            const HttpAgent = require('http-proxy-agent').HttpProxyAgent
            agent.http = new HttpAgent(proxyUrl, proxyOptions)
        }
        if (proxyUrl && _url.protocol === 'https:') {
            const HttpsAgent = require('https-proxy-agent').HttpsProxyAgent
            agent.https = new HttpsAgent(proxyUrl, proxyOptions)
        }
    }
    return agent
}

let got = GOT.extend({})

module.exports = (settings) => {
    const loggingURL = settings.loggingURL
    const token = settings.token

    if (process.env.all_proxy || process.env.https_proxy || process.env.http_proxy) {
        got = GOT.extend({
            agent: getHTTPProxyAgent(loggingURL)
        })
    }

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
