const { existsSync, statSync } = require('node:fs')
const { promises: fsPromises } = require('node:fs')
const path = require('node:path')
const utils = require('../utils')
const select = require('@inquirer/select').default
const input = require('@inquirer/input').default
const confirm = require('@inquirer/confirm').default
const figures = require('@inquirer/figures').default
const print = (message, /** @type {figures} */ figure = figures.info) => console.info(figure ?? figures.info, message)

const CHOICES = {
    SKIP: false, // skip import
    CUSTOM: -2 // custom path
}

/**
 * Asks the user if they want to import existing Node-RED flows from a directory.
 * If the user chooses to import, they can select from existing directories or enter a custom path.
 * If the user chooses to skip, the function returns false.
 * If the user chooses a custom path, the function returns the path as a string.
 * @param {*} [options] - Options object containing the `dir` to check for existing flows of an existing agent directory
 * @returns {Promise<{skip:Boolean,valid:Boolean,dir:string,flowFiles:Array}>}
 */
async function askImportDirectory (suggestedDirs) {
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
        suggestedDirDetails = suggestedDirDetails.filter(dir => dir !== null)
    }

    let choice = CHOICES.SKIP
    if (suggestedDirDetails.length > 0) {
        const choices = []
        choices.push({ name: 'Skip import', value: CHOICES.SKIP, description: 'Press <enter> to skip import' })
        suggestedDirDetails.forEach(dirDetails => {
            const flowsCount = dirDetails.flowFiles.length
            choices.push({ name: dirDetails.userDir, value: dirDetails, description: `Press <enter> to select this directory (contains ${flowsCount} Node-RED flows file${flowsCount > 1 ? 's' : ''})` })
        })
        choices.push({ name: 'Custom path...', value: CHOICES.CUSTOM, description: 'Manually enter the path to a Node-RED directory' })
        choice = await select({
            message: 'Import existing Node-RED flows?',
            choices,
            pageSize: 10,
            instructions: { navigation: 'Use arrow keys to navigate, press <enter> to confirm' }
        })
    } else {
        const answer = await confirm({
            message: 'Import existing Node-RED flows?',
            default: false
        })

        if (answer) {
            choice = CHOICES.CUSTOM
        }
    }
    let details = null
    if (choice === CHOICES.CUSTOM) {
        const customPath = await input({
            message: 'Enter the path to your Node-RED directory (leave blank to cancel):',
            validate: async (input) => {
                details = null
                if (!input.trim()) {
                    return true
                }
                if (!existsSync(input)) {
                    return 'Path does not exist.'
                }
                if (!statSync(input).isDirectory()) {
                    return 'Path is not a directory.'
                }
                // check to see if any of the files in the directory are Node-RED flows files
                details = await getDirDetails(input)
                if (!details?.valid) {
                    return `'${input}' does not contain any Node-RED flows files.`
                }
                return true
            }
        })
        if (customPath.trim() === '') {
            return CHOICES.SKIP
        }
        if (customPath && !details) {
            // tests do not cause the validate function to be called, so we need to update the details here
            details = await getDirDetails(customPath)
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

/**
 * Asks the user to select from the supplied list.
 * @param {Array<{isFlowsFile:Boolean,name:string,flowsFile:string,credsFile:string,description:string}>} flowFiles - The array of flow details
 * @returns {Promise<{isFlowsFile:Boolean,name:string,flowsFile:string,credsFile:string,description:string}>}
 */
async function askSelectFlowsFile (flowFiles) {
    if (!flowFiles?.length) {
        return false
    }

    const choices = flowFiles.map(e => ({ name: e.name, value: e, description: e.description }))
    choices.unshift({ name: 'Skip import', value: false, description: 'Press <enter> to skip import' })
    let defaultChoice = choices[1].value
    if (flowFiles.length > 1) {
        defaultChoice = flowFiles.find(e => e.name === 'flows.json') || defaultChoice
    }
    const choice = await select({
        message: 'Select a flows file:',
        choices,
        pageSize: 10,
        default: defaultChoice,
        instructions: { navigation: 'Use arrow keys to navigate, press <enter> to confirm' }
    })

    return choice || false
}

async function getDirDetails (dir) {
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
            const flowsFileDetails = await getFlowsFileDetails(userDir, file)
            if (flowsFileDetails?.isFlowsFile) {
                jsonFiles.push(flowsFileDetails)
            }
        }
    }
    return jsonFiles
}

async function getFlowsFileDetails (dir, file) {
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
        const fileData = await fsPromises.readFile(filePath, 'utf8')
        const flows = JSON.parse(fileData)
        if (Array.isArray(flows)) {
            const duckTypeTest = flows.every(node => typeof node.id === 'string' && typeof node.type === 'string' && node.id.length > 0 && node.type.length > 0)
            if (!duckTypeTest) {
                return result
            }
            result.isFlowsFile = true
            result.description = `Press <enter> to import '${file}'`
            result.flows = flows
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
    const __askImportDirectory = module.exports.askImportDirectory // use the module definition so that mock tests can override it
    const __askSelectFlowsFile = module.exports.askSelectFlowsFile
    const importDetails = await __askImportDirectory(suggestedDirs)
    if (importDetails === CHOICES.SKIP || importDetails.skip || !importDetails?.valid) {
        return null
    }
    const selectedFlows = await __askSelectFlowsFile(importDetails.flowFiles)
    if (selectedFlows) {
        const userDir = path.dirname(selectedFlows.flowsFile)
        selectedFlows.credentials = {} // default to empty credentials
        selectedFlows.credentialSecret = null // default to null
        selectedFlows.packageFile = path.join(userDir, 'package.json')
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
    askImportDirectory,
    askSelectFlowsFile,
    getDirDetails,
    getFlowFiles,
    getFlowsFileDetails,
    flowImport
}
