const fs = require('fs')
const proxyFromEnv = require('proxy-from-env')

module.exports = {
    compareNodeRedData,
    compareObjects,
    isObject,
    hasProperty,
    getWSProxyAgent,
    getHTTPProxyAgent,
    getPackageData,
    extractKeyValueFromJsContent,
    loadAndParseJsonFile
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

function getPackageData (packageJsonFile, options) {
    options = options || {}
    const data = {
        modules: {},
        version: '',
        name: '',
        description: ''
    }
    const packageJSON = fs.readFileSync(packageJsonFile)
    const packageData = JSON.parse(packageJSON)
    data.modules = packageData.dependencies
    data.version = packageData.version
    data.name = packageData.name
    data.description = packageData.description

    if (options.convertFileModulesToLatest) {
        const modules = data.modules || {}
        for (const key in modules) {
            if (modules[key] && modules[key].startsWith('file:')) {
                modules[key] = '*'
            }
        }
        data.modules = modules
    }

    return data
}

/**
 * Extracts the value of a specified key from a JavaScript object string, ignoring comments.
 * Typically used to grab the `credentialSecret` from a Node-RED settings.js file.
 * NOTE: This is a basic implementation and may not cover all edge cases. For example,
 * it does not evaluate the JavaScript code, so it won't work for complex expressions or multi-line values.
 * Additionally, it assumes that the key-value pairs on their own lines (i.e. minified code may not work)
 * @param {string} jsContent - The JavaScript content as a string.
 * @param {string} keyName - The name of the key to extract the value for.
 * @returns {string|null} - The value of the key if found, otherwise null.
 */
function extractKeyValueFromJsContent (jsContent, keyName) {
    if (typeof jsContent !== 'string' || typeof keyName !== 'string' || keyName.length === 0) {
        console.error('Invalid input: jsContent must be a string and keyName must be a non-empty string.')
        return null
    }

    // Escape the keyName in case it contains special regex characters.
    const escapedKeyName = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string

    // 1. Remove block comments.
    const contentWithoutBlockComments = jsContent.replace(/\/\*[\s\S]*?\*\//g, '')

    // 2. Use a regex to find the uncommented key line and extract the value.
    //    - ^\s*: Matches the start of a line followed by optional whitespace.
    //    - ${escapedKeyName}:\s*: Matches the provided key name and colon followed by optional whitespace.
    //    - (['"]): Captures the opening quote (either single or double) into group 1.
    //    - (.*?): Captures the value inside the quotes (non-greedily) into group 2.
    //    - \1: Matches the same character captured in group 1 (the closing quote).
    //    - m flag: Enables multiline mode, so ^ and $ match start/end of lines.
    const valueMatch = contentWithoutBlockComments.match(
        new RegExp(`^\\s*${escapedKeyName}:\\s*(['"])(.*?)\\1`, 'm')
    )

    if (valueMatch && valueMatch[2]) {
        // The value is in the second capturing group
        return valueMatch[2]
    } else {
        // Not found or commented out in a way the regex doesn't catch
        return null
    }
}

/**
 * Load and parse a JSON file
 * * @param {string} filePath - The path to the JSON file.
 * * @returns {Object|null} - The parsed JSON object, or null if the file doesn't exist or is invalid.
 */
function loadAndParseJsonFile (filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const settingsData = fs.readFileSync(filePath, 'utf8')
            return JSON.parse(settingsData)
        }
    } catch (error) {
    }
    return null
}
