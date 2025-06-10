const { existsSync, statSync } = require('node:fs')
const { promises: fsPromises } = require('node:fs')
const fs = require('node:fs')
const path = require('node:path')
const utils = require('../utils')
const { default: chalk } = require('chalk')
const select = require('@inquirer/select').default
const figures = require('@inquirer/figures').default
const print = (message, /** @type {figures} */ figure = figures.info) => console.info(figure ?? figures.info, message)
const fileSelector = require('./fileSelector/index.js').fileSelector

const CHOICES = {
    SKIP: false, // skip import
    BROWSE: -2 // browse filesystem
}

/**
 * Asks the user if they want to import existing Node-RED flows from a directory.
 * If the user chooses to import, they can select from existing directories or browse.
 * If the user chooses to skip, the function returns false.
 * If the user chooses a custom path, the function returns an object containing the path and other details.
 * @param {*} [options] - Options object containing the `dir` to check for existing flows of an existing agent directory
 * @returns {Promise<{skip:Boolean,valid:Boolean,dir:string,flowFiles:Array}>}
 */
async function askImport (suggestedDirs) {
    // get details for each suggested directory
    let suggestedDirDetails = []
    if (suggestedDirs?.length > 0) {
        suggestedDirDetails = await Promise.all(suggestedDirs.map(async (dir) => {
            const dirDetails = await getDirDetails(dir)
            if (dirDetails.valid) {
                return dirDetails
            }
            return null
        }))
        suggestedDirDetails = suggestedDirDetails.filter(dir => dir !== null && dir.valid)
    }

    let choice = CHOICES.SKIP
    const choices = []
    choices.push({ name: 'Skip import', value: CHOICES.SKIP, description: 'Press <enter> to skip import' })
    suggestedDirDetails.forEach(dirDetails => {
        const flowsCount = dirDetails.flowFiles.length
        choices.push({ name: `Select a flow from "${dirDetails.userDir}"...`, value: dirDetails, description: `Press <enter> to browse this directory (contains ${flowsCount} Node-RED flows file${flowsCount > 1 ? 's' : ''})` })
    })
    choices.push({ name: 'Browse filesystem for flows...', value: CHOICES.BROWSE, description: 'Press <enter> to browse the filesystem for Node-RED flows files' })
    choice = await select({
        message: 'Import existing Node-RED flows?',
        choices,
        pageSize: 10,
        instructions: { navigation: chalk.gray('Use arrow keys to select an option, press <enter> to confirm') }
    })
    const dirChosen = choice && suggestedDirDetails.find(dir => dir.userDir === choice.userDir && dir.valid)
    if (choice === CHOICES.BROWSE || dirChosen) {
        const choice = await askBrowseForFlowFile(dirChosen ? dirChosen.userDir : null)
        if (!choice || choice === 'canceled') {
            return CHOICES.SKIP
        }
        if (!choice.path?.trim()) {
            return CHOICES.SKIP
        }
        const details = {
            ...choice,
            valid: true,
            packageFile: path.join(choice.dir, 'package.json')
        }
        return details
    }
    if (choice === CHOICES.SKIP) {
        return {
            skip: true
        }
    }

    return choice
}

async function askBrowseForFlowFile (startDir) {
    const basePath = startDir || process.cwd()
    const itemInfo = {}
    const selectedOption = await fileSelector({
        mode: 'file',
        message: 'Select a flow file',
        basePath,
        allowCancel: true,
        pageSize: 10,
        loop: false,
        filter: (item) => {
            // return all items that are directories or valid Node-RED flow files
            if (item?.isDirectory) {
                return true
            }
            if (!item?.name || !item.name.endsWith('.json')) {
                return false
            }
            try {
                const flowsFileDetails = getFlowsFileDetails(path.dirname(item.path), path.basename(item.path))
                itemInfo[item.path] = flowsFileDetails
                return flowsFileDetails?.isFlowsFile
            } catch (error) {
                return false
            }
        },
        fileDescriptionHook: (item, _context) => {
            if (!item || !item.path) {
                return 'No details available for this item'
            }
            const lastModifiedDate = new Date(item.lastModifiedMs).toLocaleString().replace(', ', ' ')
            const sizeInKB = (item.size / 1024).toFixed(2)
            let sizeString = `, ${sizeInKB} KB`
            if (sizeInKB > 1024) {
                sizeString = `, ${(sizeInKB / 1024).toFixed(2)} MB`
            }
            const itemDetails = itemInfo[item.path]
            let itemDetailsString = ''
            if (itemDetails) {
                const sb = []
                sb.push(`, ${itemDetails.tabCount} Tab${itemDetails.tabCount === 1 ? '' : 's'}`)
                if (itemDetails.subflowCount > 0) {
                    sb.push(`, ${itemDetails.subflowCount} Subflow${itemDetails.subflowCount === 1 ? '' : 's'}`)
                }
                sb.push(`, ${itemDetails.nodeCount}${itemDetails.nodeCount === 1 ? ' Node' : ' Nodes'}`)
                itemDetailsString = sb.join('')
            }
            return `Last Modified ${lastModifiedDate}${sizeString}${itemDetailsString}${item.helpText ? `. ${item.helpText}` : ''}`
        }
    })
    return selectedOption
}

async function getDirDetails (dir) {
    try {
        const userDir = path.resolve(dir)
        const flowFiles = await getFlowFiles(userDir)
        if (flowFiles.length > 0) {
            const result = {
                valid: true,
                userDir,
                flowFiles,
                packageFile: path.join(userDir, 'package.json')
            }
            return result
        }
        return {
            valid: false,
            userDir,
            flowFiles: [],
            packageFile: path.join(userDir, 'package.json')
        }
    } catch (_error) {
        // If we cannot read the directory, return invalid
        return {
            valid: false,
            userDir: dir,
            flowFiles: [],
            packageFile: null
        }
    }
}

async function getFlowFiles (userDir) {
    if (!userDir) {
        return []
    }
    if (!existsSync(userDir) || !statSync(userDir).isDirectory()) {
        return []
    }
    if (!existsSync(path.join(userDir, 'package.json'))) {
        return []
    }

    const jsonFiles = [] // array of *.json files in the userDir
    const files = await fsPromises.readdir(userDir)
    for (const file of files) {
        // skip the following files:
        // - package.json
        // - *_cred.json
        // - .config*.json
        const skipFiles = [
            /package\.json/,
            /.+_cred\.json/,
            /\.config.*\.json/
        ]
        const skipFile = !!skipFiles.find(skipFile => new RegExp(skipFile).test(file))
        if (file.endsWith('.json') && !skipFile) {
            // check if the file is a Node-RED flows file or a Node-RED credentials file
            const flowsFileDetails = getFlowsFileDetails(userDir, file)
            if (flowsFileDetails?.isFlowsFile) {
                jsonFiles.push(flowsFileDetails)
            }
        }
    }
    return jsonFiles
}

function getFlowsFileDetails (dir, file) {
    const filePath = path.join(dir, file)
    const userDir = path.dirname(filePath)
    const result = {
        isFlowsFile: false,
        userDir,
        name: file,
        flowsFile: filePath,
        credsFile: null,
        description: 'Not a valid Node-RED flows file'
    }
    try {
        const fileData = fs.readFileSync(filePath, 'utf8')
        const flows = JSON.parse(fileData)
        if (Array.isArray(flows)) {
            const duckTypeTest = flows.every(node => typeof node.id === 'string' && typeof node.type === 'string' && node.id.length > 0 && node.type.length > 0)
            if (!duckTypeTest) {
                return result
            }
            result.isFlowsFile = true
            result.flows = flows
            result.tabCount = flows.filter(flow => flow.type === 'tab').length
            result.subflowCount = flows.filter(flow => flow.type === 'subflow').length
            result.nodeCount = flows.filter(flow => flow.type !== 'global').length - result.tabCount - result.subflowCount
            const credFile = filePath.replace(/\.json$/, '_cred.json')
            if (existsSync(credFile)) {
                result.credsFile = credFile
            }
            return result
        }
    } catch (error) {
        // Ignore errors
    }
    return result
}

async function flowImport (suggestedDirs) {
    const __askImport = module.exports.askImport // use the module definition so that mock tests can override it
    const importDetails = await __askImport(suggestedDirs)
    if (importDetails === CHOICES.SKIP || importDetails.skip || !importDetails?.valid) {
        return null
    }
    const selectedFlows = getFlowsFileDetails(importDetails.dir, importDetails.name)
    if (selectedFlows) {
        const userDir = selectedFlows.userDir
        selectedFlows.credentials = {} // default to empty credentials
        selectedFlows.credentialSecret = null // default to null
        selectedFlows.packageFile = importDetails.packageFile
        if (selectedFlows.credsFile && existsSync(selectedFlows.credsFile)) {
            print(`Importing credentials '${selectedFlows.credsFile}'...`)
            selectedFlows.credentials = await fsPromises.readFile(selectedFlows.credsFile, 'utf8')
            selectedFlows.credentials = JSON.parse(selectedFlows.credentials)
            // now, see if we can locate the credentialSecret for the creds file

            // 1. check the .config.runtime.json file for the credentialSecret
            const data = utils.loadAndParseJsonFile(path.join(userDir, '.config.runtime.json'))
            selectedFlows.credentialSecret = data?._credentialSecret ?? null

            // 2. check if settings.json file has credentialSecret (this is where FF stores it)
            if (!selectedFlows.credentialSecret) {
                const data = utils.loadAndParseJsonFile(path.join(userDir, 'settings.json'))
                selectedFlows.credentialSecret = data?.credentialSecret ?? null
            }

            // 3. check if settings.js file has credentialSecret (this is where FF stores it)
            if (!selectedFlows.credentialSecret) {
                try {
                    const settingsFile = path.join(userDir, 'settings.js')
                    if (existsSync(settingsFile)) {
                        const settings = await fsPromises.readFile(settingsFile, 'utf8')
                        selectedFlows.credentialSecret = settings ? utils.extractKeyValueFromJsContent(settings || '', 'credentialSecret') : null
                    }
                } catch (error) {
                    selectedFlows.credentialSecret = null
                }
            }

            if (!selectedFlows.credentialSecret) {
                print('Could not determine the credentials secret. Flows will be imported without credentials.', figures.warning)
                selectedFlows.credentials = {}
            }
        } else {
            selectedFlows.credentials = {}
        }
        print(`Importing package '${selectedFlows.packageFile}'...`)
        selectedFlows.package = utils.getPackageData(selectedFlows.packageFile, { convertFileModulesToLatest: true })
        return selectedFlows
    }
    return null
}

module.exports = {
    askImport,
    getDirDetails,
    getFlowFiles,
    getFlowsFileDetails,
    flowImport
}
