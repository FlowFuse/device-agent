const proxyFromEnv = require('proxy-from-env')

module.exports = {
    compareNodeRedData,
    compareObjects,
    isObject,
    hasProperty,
    getWSProxyAgent,
    getHTTPProxyAgent
}

/**
 * Compare Node Red flows & modules data from two different sources
 * Use to determine if Node-RED files and the Platform snapshot are in sync
 * @param {{flows:[Object], modules:Object}} data1
 * @param {{flows:[Object], modules:Object}} data2
 * @returns {boolean}
 */
function compareNodeRedData (data1, data2) {
    if (typeof data1 !== typeof data2) {
        return false
    } else if (data1 === data2) {
        return true
    } else if (data1 === null || data2 === null) {
        return false
    }
    const flow1 = typeof data1.flows === 'object' ? JSON.stringify(data1.flows) : null
    const flow2 = typeof data2.flows === 'object' ? JSON.stringify(data2.flows) : null
    if (flow1 !== flow2) {
        return false
    }
    if (!compareObjects(data1.modules || {}, data2.modules || {})) {
        return false
    }
    return true
}

/**
 * Compare two objects for equality
 * This is a deep comparison, so nested objects are compared
 * @param {Object} object1 - The first object to compare
 * @param {Object} object2 - The second object to compare
 * @returns true if the objects are equal, false otherwise
 */
function compareObjects (object1, object2) {
    if (typeof object1 !== 'object' || typeof object2 !== 'object') { // must be objects
        return false
    } else if (object1 === object2) { // reference equality - OK (even null === null is ok as they are both "something" and equal)
        return true
    }

    const objKeys1 = Object.keys(object1)
    const objKeys2 = Object.keys(object2)

    if (objKeys1.length !== objKeys2.length) return false

    for (const key of objKeys1) {
        const value1 = object1[key]
        const value2 = object2[key]

        const isObjects = isObject(value1) && isObject(value2)

        if ((isObjects && !compareObjects(value1, value2)) ||
            (!isObjects && value1 !== value2)) {
            return false
        }
    }
    return true
}

function isObject (object) {
    return object != null && typeof object === 'object'
}

/**
 * Test if an object has a property - Node 14 friendly version of Object.hasOwn
 * @param {Object} object - an object to check for a property
 * @param {String} property - the name of the property to check for
 * @returns `true` if the object has the property, `false` otherwise
 */
function hasProperty (object, property) {
    return !!(object && Object.prototype.hasOwnProperty.call(object, property))
}

/**
 * Get a specific proxy agent for a WebSocket connection. This should be applied to the `wsOptions.agent` property
 *
 * NOTE: This utility function is specifically designed for the MQTT instances where the proxy is set based on the http based EndPoint
 *       that the instance will use to make a connection. As such, the proxy URL is determined based on the `wsEndPoint` provided in
 *       conjunction with env vars `http_proxy`, `https_proxy` and `no_proxy`.
 *
 * More Info:
 *   `wsOptions.agent` is expected to be an HTTP or HTTPS agent based on the request protocol
 *   http/ws requests use env var `http_proxy` and the HttpProxyAgent
 *   https/wss requests use env var `https_proxy` and the HttpsProxyAgent
 *   REF: https://github.com/TooTallNate/proxy-agents/tree/main/packages/proxy-agent#maps-proxy-protocols-to-httpagent-implementations
 *
 * @param {String} url - WebSocket url
 * @param {import('http').AgentOptions} proxyOptions - proxy options
 * @returns {import('https-proxy-agent').HttpsProxyAgent | import('http-proxy-agent').HttpProxyAgent | null}
 */
function getWSProxyAgent (url, proxyOptions) {
    if (!url) {
        return null
    }
    const _url = new URL(url)
    const isHTTPBased = _url.protocol === 'ws:' || _url.protocol === 'http:'
    const isHTTPSBased = _url.protocol === 'wss:' || _url.protocol === 'https:'
    if (!isHTTPBased && !isHTTPSBased) {
        return null
    }

    // replace ^ws with http so that getProxyForUrl can return the correct http*_proxy for ws/wss
    const proxyUrl = proxyFromEnv.getProxyForUrl(url.replace(/^ws/, 'http'))

    if (proxyUrl && isHTTPSBased) {
        const HttpsAgent = require('https-proxy-agent').HttpsProxyAgent
        return new HttpsAgent(proxyUrl, proxyOptions)
    }
    if (proxyUrl && isHTTPBased) {
        const HttpAgent = require('http-proxy-agent').HttpProxyAgent
        return new HttpAgent(proxyUrl, proxyOptions)
    }
    return null
}

/**
 * Get proxy agent for HTTP or HTTPS got instance. This should be applied to the `agent` property of the got instance options
 *
 * NOTE: This utility function is specifically designed for the GOT instances where the proxy is set based on the `httpEndPoint`
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
