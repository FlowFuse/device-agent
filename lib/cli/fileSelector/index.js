// This component and its adjacent files are a large rework of the MIT licenced @inquirer-file-selector
// (https://www.npmjs.com/package/inquirer-file-selector)
// It was the closest match to the functionality we needed, but did not have some of the features we wanted like:
// not showing parent .. dir, unfavourable navigation key bindings (& no means of changing them), no means of
// dynamically setting dir/file descriptions, and it would crash on certain directories (permission issues #94), etc.
// Below is a copy of the original license

/*
Copyright 2024 Brian Fernandez

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict'
const path = require('node:path')
const {
    createPrompt,
    makeTheme,
    useKeypress,
    useMemo,
    usePagination,
    usePrefix,
    useState
} = require('@inquirer/core')
const { ANSI_HIDE_CURSOR, Status } = require('./consts')
const { baseTheme } = require('./theme')
const {
    createRawItem,
    ensurePathSeparator,
    readRawItems,
    sortRawItems,
    stripInternalProps
} = require('./utils/item')
const {
    isBackspaceKey,
    isDownKey,
    isEnterKey,
    isEscapeKey,
    isSpaceKey,
    isUpKey,
    isLeftArrowKey,
    isRightArrowKey,
    isPageUp,
    isPageDown
} = require('./utils/key')

/**
 * Creates a file or directory selector prompt.
 * @param {Object} config - Configuration for the prompt.
 * @param {string} [config.message] - Message to display in the prompt.
 * @param {string} [config.basePath='.'] - Path to start the selection from.
 * @param {'file'|'directory'} [config.mode='file'] - Mode of selection, either 'file' or 'directory'.
 * @param {number} [config.pageSize=10] - Number of items to display per page.
 * @param {boolean} [config.loop=false] - Whether to loop through items.
 * @param {function} [config.filter] - Function to filter items.
 * @param {function} [config.fileDescriptionHook] - Hook to format file descriptions.
 * @param {function} [config.directoryDescriptionHook] - Hook to format directory descriptions.
 * @param {boolean} [config.showExcluded=false] - Whether to show excluded items.
 * @param {boolean} [config.allowCancel=false] - Whether to allow canceling the prompt.
 * @param {string} [config.cancelText='Canceled.'] - Text to display when canceled.
 * @param {string} [config.emptyText='Directory is empty.'] - Text to display when the directory is empty.
 */
function fileSelector (config) {
    return createPrompt((config, done) => {
        const {
            mode = 'file',
            message = 'Select a file',
            pageSize = 10,
            loop = false,
            filter = () => true,
            fileDescriptionHook = null,
            directoryDescriptionHook = null,
            showExcluded = false,
            allowCancel = false,
            cancelText = 'Canceled.',
            emptyText = 'Directory is empty.'
        } = config

        const [status, setStatus] = useState(Status.Idle)
        const theme = makeTheme(baseTheme, config.theme)
        const prefix = usePrefix({ status, theme })

        const [currentDir, setCurrentDir] = useState(
            path.resolve(process.cwd(), config.basePath || '.')
        )

        const items = useMemo(() => {
            const rawItems = readRawItems(currentDir)
                .map(rawItem => {
                    const strippedItem = stripInternalProps(rawItem)
                    const isDisabled = !filter(strippedItem)
                    return { ...rawItem, isDisabled }
                })
            const filteredItems = []
            filteredItems.push(...rawItems.filter(rawItem => showExcluded || !rawItem.isDisabled))
            sortRawItems(filteredItems)

            const parentPath = path.join(currentDir, '..')
            const hasParent = parentPath !== currentDir
            const parent = hasParent ? createRawItem(parentPath) : null
            if (parent) {
                parent.displayName = ensurePathSeparator('..')
                parent.isDisabled = false
                parent.isParentDirectory = true // Mark as parent directory
            }

            if (parent) {
                filteredItems.unshift(parent)
            }

            if (mode !== 'file') {
                const cwd = createRawItem(currentDir)
                cwd.displayName = ensurePathSeparator('.')
                cwd.isCurrentDirectory = true // Mark as current directory
                filteredItems.unshift(cwd)
            }

            return filteredItems
        }, [currentDir])

        const bounds = useMemo(() => {
            const first = items.findIndex(rawItem => !rawItem.isDisabled)
            const last = items.findLastIndex(rawItem => !rawItem.isDisabled)

            if (first === -1) {
                return { first: 0, last: 0 }
            }

            return { first, last }
        }, [items])

        const [active, setActive] = useState(bounds.first)
        const activeItem = items[active]

        useKeypress((key, rl) => {
            const enterSelectsDir = !activeItem.isDisabled && mode === 'directory' && activeItem?.isDirectory && !activeItem.isParentDirectory
            const enterOpensDir = !activeItem.isDisabled && (
                (mode === 'file' && activeItem?.isDirectory) ||
                (mode === 'directory' && activeItem?.isDirectory && activeItem.isParentDirectory)
            )
            const enterSelectsFile = !activeItem.isDisabled && mode === 'file' && !activeItem?.isDirectory
            const enterDoesNothing = activeItem?.isDisabled || (!enterSelectsDir && !enterOpensDir && !enterSelectsFile)
            if (enterDoesNothing) {
                return
            }
            if (activeItem && isEnterKey(key)) {
                if (enterOpensDir) {
                    setCurrentDir(activeItem.path)
                    setActive(bounds.first)
                } else if (enterSelectsDir || enterSelectsFile) {
                    const strippedItem = stripInternalProps(activeItem)
                    setStatus(Status.Done)
                    done(strippedItem)
                }
            } else if (activeItem?.isDirectory && ((enterOpensDir && isEnterKey(key)) || isSpaceKey(key) || isRightArrowKey(key))) {
                setCurrentDir(activeItem.path)
                setActive(bounds.first)
            } else if (isUpKey(key) || isDownKey(key)) {
                rl.clearLine(0)

                if (
                    loop ||
                    (isUpKey(key) && active !== bounds.first) ||
                    (isDownKey(key) && active !== bounds.last)
                ) {
                    const offset = isUpKey(key) ? -1 : 1
                    let next = active

                    do {
                        next = (next + offset + items.length) % items.length
                    } while (items[next].isDisabled)

                    setActive(next)
                }
            } else if (isPageDown(key)) {
                rl.clearLine(0)
                let next = active + (pageSize || 10)
                if (next >= items.length) {
                    next = items.length - 1
                }

                while (next > active && items[next].isDisabled) {
                    next--
                    // guard against going below the first item
                    if (next < bounds.first) {
                        next = bounds.first
                        break
                    }
                }
                if (next !== active) {
                    setActive(next)
                }
            } else if (isPageUp(key)) {
                rl.clearLine(0)
                let next = active - (pageSize || 10)
                if (next < 0) {
                    next = 0
                }
                while (next < active && items[next].isDisabled) {
                    next++
                    // guard against going above the last item
                    if (next > bounds.last) {
                        next = bounds.last
                        break
                    }
                }
                if (next !== active) {
                    setActive(next)
                }
            } else if (isBackspaceKey(key) || isLeftArrowKey(key)) {
                setCurrentDir(path.resolve(currentDir, '..'))
                setActive(bounds.first)
            } else if (isEscapeKey(key) && allowCancel) {
                setStatus(Status.Canceled)
                done(null)
            }
        })

        const page = usePagination({
            items,
            active,
            renderItem: ({ item, index, isActive }) => {
                const isCwd = item.path === currentDir
                return theme.renderItem(item, { items, loop, index, isActive, isCwd, mode: config.mode, fileDescriptionHook, directoryDescriptionHook })
            },
            pageSize,
            loop
        })

        const styledMessage = theme.style.message(message || `Select a ${mode}`, status)

        if (status === Status.Canceled) {
            return `${prefix} ${styledMessage} ${theme.style.cancelText(cancelText)}`
        }

        if (status === Status.Done) {
            return `${prefix} ${styledMessage} ${theme.style.answer(activeItem.path)}`
        }

        const helpTop = theme.style.help(theme.help.top(allowCancel))
        const header = theme.style.currentDir(ensurePathSeparator(currentDir))

        return `${prefix} ${styledMessage} ${helpTop}\n${header}\n${!page.length ? theme.style.emptyText(emptyText) : page}${ANSI_HIDE_CURSOR}`
    })(config)
}

module.exports = { fileSelector, Status }
