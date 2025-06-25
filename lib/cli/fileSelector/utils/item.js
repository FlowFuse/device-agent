// eslint-disable-next-line no-unused-vars
const { readdirSync, statSync, Stats } = require('node:fs')
const { basename, join, sep, dirname } = require('node:path')

/** Appends the system-specific path separator to the end of the path if missing. */
function ensurePathSeparator (path) {
    return path.endsWith(sep) ? path : `${path}${sep}`
}

/** Creates a `RawItem` from a given filesystem path. */
function createRawItem (path) {
    const name = basename(path)
    const dir = dirname(path)
    try {
        /** @type {Stats} */
        const stats = statSync(path)
        const isDirectory = stats.isDirectory()
        const displayName = isDirectory ? ensurePathSeparator(name) : name

        return {
            displayName,
            name,
            path,
            dir,
            size: stats.size,
            createdMs: stats.birthtimeMs,
            lastModifiedMs: stats.mtimeMs,
            isDisabled: false,
            isDirectory
        }
    } catch (error) {
        // console.error(`Error reading path "${path}":`, error);
        return {
            displayName: name,
            name,
            path,
            dir,
            size: 0,
            createdMs: 0,
            lastModifiedMs: 0,
            isDisabled: true,
            isDirectory: false
        }
    }
}

/** Reads all entries in the directory and returns them as `RawItem[]`. */
function readRawItems (path, mode = 'file') {
    let dirRead = []
    if (mode !== 'file' && mode !== 'directory') {
        return dirRead
    }
    try {
        dirRead = readdirSync(path)
    } catch (_error) {
        if (_error.code === 'ENOENT') {
            console.log(`Directory "${path}" does not exist.`)
            return []
        }
        if (_error.code === 'EPERM') {
            console.log(`Permission denied to read directory "${path}".`)
            return []
        }
        // console.log(`Error reading directory "${path}":`, _error);
    }

    const result = dirRead.map(fileName => {
        const filePath = join(path, fileName)
        return createRawItem(filePath)
    })
    return result
}

/**
 * Sorts the given array of `RawItem`s by the following criteria:
 * 1. Enabled items before disabled ones.
 * 2. Directories before files.
 * 3. Alphabetical order (by name) if priorities match.
 *
 * Mutates the original array.
 * @param {RawItem[]} items - The array of `RawItem`s to sort.
 * @returns {void}
 */
function sortRawItems (items) {
    items.sort((a, b) => {
        const aPriority = (a.isDisabled ? 2 : 0) + (a.isDirectory ? -1 : 0)
        const bPriority = (b.isDisabled ? 2 : 0) + (b.isDirectory ? -1 : 0)

        if (aPriority !== bPriority) {
            return aPriority - bPriority
        }

        return a.name.localeCompare(b.name)
    })
}

/** Removes internal-only properties (`displayName` and `isDisabled`) from a `RawItem`. */
function stripInternalProps (raw) {
    const { displayName, isDisabled, ...item } = raw
    return item
}

module.exports = {
    ensurePathSeparator,
    createRawItem,
    readRawItems,
    sortRawItems,
    stripInternalProps
}
