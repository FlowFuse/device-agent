const path = require('path')
const fs = require('fs').promises

module.exports = {
    compareNodeRedData,
    compareObjects,
    isObject,
    hasProperty,
    copyDir
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

/**
 * Copy a directory from one location to another
 * @param {string} src - source directory
 * @param {string} dest - destination directory
 * @param {Object} [options] - options
 * @param {boolean} [options.recursive=true] - whether to copy recursively (default: true)
 */
async function copyDir (src, dest, { recursive = true } = {}) {
    // for nodejs v 16.7.0 and later, fs.cp will be available
    if (fs.cp && typeof fs.cp === 'function') {
        await fs.cp(src, dest, { recursive })
        return
    }
    // fallback to own implementation of recursive copy (for Node.js 14)
    // TODO: remove this when Node.js 14 is no longer supported by the device agent
    const cp = async (src, dest) => {
        const lstat = await fs.lstat(src).catch(_err => { })
        if (!lstat) {
            // do nothing
        } else if (lstat.isFile()) {
            await fs.copyFile(src, dest)
        } else if (lstat.isDirectory()) {
            await fs.mkdir(dest).catch(_err => { })
            if (recursive) {
                for (const f of await fs.readdir(src)) {
                    await cp(path.join(src, f), path.join(dest, f))
                }
            }
        }
    }
    await cp(src, dest)
}
