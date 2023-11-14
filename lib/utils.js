const path = require('path')
const existsSync = require('fs').existsSync

module.exports = {
    compareNodeRedData,
    compareObjects,
    isObject,
    hasProperty,
    isDevEnv,
    getPackagePath
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
 * Test if an object has a property
 * @param {Object} object - an object to check for a property
 * @param {String} property - the name of the property to check for
 * @returns `true` if the object has the property, `false` otherwise
 */
function hasProperty (object, property) {
    return !!(object && Object.prototype.hasOwnProperty.call(object, property))
}

const devPackages = path.join(__dirname, '..', '..', '..', 'packages')
const runtimePackages = path.join(__dirname, '..', 'node_modules')

/**
 * Test if the runtime is running in a development environment.
 * Development environment is defined as:
 * * `NODE_ENV` is set to 'development'
 * - OR
 * * 'packages' directory exists AND another "known" package exists (/packages/nr-project-nodes)
 * @returns {boolean} true if the runtime is running in a development environment
 */
function isDevEnv () {
    // if NODE_ENV is set, use that
    if (process.env.NODE_ENV) {
        return process.env.NODE_ENV === 'development'
    }
    const devEnvTestPath = path.join(devPackages, 'nr-project-nodes').replace(/\\/g, '/')
    if (existsSync(devEnvTestPath)) {
        return true
    }
    return false
}

/**
 * Get the full path to a package.
 *
 * When running in a development environment, the path to the package in the dev-env is returned.
 *
 * When running in a runtime environment, the path to the package in the device-agent node_modules is returned.
 * @example
 * // process.env.NODE_ENV = 'development'
 * getPackagePath('nr-project-nodes')
 * // returns '/path/to/dev-env/packages/nr-project-nodes'
 * @example
 * // process.env.NODE_ENV = '' && 'nr-project-nodes' exists in `dev-env/packages`
 * getPackagePath('nr-project-nodes')
 * // returns '/path/to/dev-env/packages/nr-project-nodes'
 * @example
 * // process.env.NODE_ENV = 'production' || 'nr-project-nodes' does not exist in `dev-env/packages`
 * getPackagePath('@flowfuse/nr-project-nodes')
 * // returns '/path/to/device-agent/node_modules/@flowfuse/nr-project-nodes'
 * @param  {...string} packageName Name of the package to get the path for
 * @returns {string} The full path to the package
 */
function getPackagePath (...packageName) {
    if (isDevEnv()) {
        return path.join(devPackages, ...packageName).replace(/\\/g, '/')
    }
    return path.join(runtimePackages, ...packageName).replace(/\\/g, '/')
}
