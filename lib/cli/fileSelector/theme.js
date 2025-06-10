const { default: figures } = require('@inquirer/figures')
const chalk = require('yoctocolors-cjs') // switch to the lighter yoctocolors-cjs to match @inquirer
const baseTheme = {
    prefix: {
        idle: chalk.cyan('?'),
        done: chalk.green(figures.tick),
        canceled: chalk.red(figures.cross)
    },
    style: {
        disabled: (linePrefix, text) =>
            chalk.gray(`${linePrefix} ${chalk.strikethrough(text)}`),
        active: (text) => chalk.cyanBright(text),
        cancelText: (text) => chalk.red(text),
        emptyText: (text) => chalk.red(text),
        directory: (text) => chalk.yellowBright(text),
        file: (text) => text,
        currentDir: (text) => chalk.cyan(text),
        message: (text, _status) => chalk.bold(text),
        help: (text) => chalk.italic(chalk.gray(text))
    },
    hierarchySymbols: {
        branch: figures.lineUpDownRight + figures.line,
        leaf: figures.lineUpRight + figures.line
    },
    help: {
        top: (allowCancel, context) => {
            if (context && context.mode === 'directory') {
                return `(Use arrows ${figures.arrowUp} ${figures.arrowDown} to navigate, <enter> to select directory, <esc> to cancel)`
            }
            return `(Use arrows ${figures.arrowUp} ${figures.arrowDown} ${figures.arrowLeft} ${figures.arrowRight} to navigate${allowCancel ? ', <enter> to select file, <esc> to cancel' : ''})`
        },
        directory: (item, context) => {
            const { isCwd, mode } = context
            let helpText
            if (isCwd) {
                helpText = '(Press <enter> to select this directory)'
            } else if (item.isParentDirectory && mode === 'directory') {
                helpText = '(Press <enter> to navigate)'
            } else {
                const enterSelectsDir = item.isDirectory && mode === 'directory'
                if (enterSelectsDir) {
                    helpText = '(Press <enter> to select)'
                } else {
                    helpText = '(Press <enter> to navigate)'
                }
            }
            return helpText
        },
        file: (item, context) => {
            return '(Press <enter> to select)'
        }
    },
    /**
     * Render a file or directory item.
     * @param {{ item: { displayName: string, isDirectory: boolean }, index:number, isActive:boolean }} item
     * @param {{ items, loop, index:number, isActive:boolean, isCwd:boolean, mode: 'file|directory' }} context
     * @returns
     */
    renderItem (item, context) {
        const { fileDescriptionHook, directoryDescriptionHook } = context
        const isLast = context.index === context.items.length - 1
        const linePrefix =
            isLast && !context.loop
                ? this.hierarchySymbols.leaf
                : this.hierarchySymbols.branch

        if (item.isDisabled) {
            return this.style.disabled(linePrefix, item.displayName)
        }

        const baseColor = item.isDirectory ? this.style.directory : this.style.file
        const color = context.isActive ? this.style.active : baseColor
        let line = color(`${linePrefix} ${item.displayName}`)

        if (context.isActive) {
            if (item.isDirectory) {
                item.helpText = this.help.directory(item, context)
                item.helpText = directoryDescriptionHook ? directoryDescriptionHook(item, context) : item.helpText
            } else {
                item.helpText = this.help.file(item, context)
                item.helpText = fileDescriptionHook ? fileDescriptionHook(item, context) : item.helpText
            }
            if (item.helpText) {
                line = `${line} ${this.style.help(item.helpText)}`
            }
        }

        return line
    }
}

module.exports = { baseTheme }
