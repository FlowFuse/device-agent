const { existsSync, statSync } = require('node:fs')
const { promises: fsPromises } = require('node:fs')
const fs = require('node:fs')
const path = require('node:path')
const utils = require('../utils')
const chalk = require('yoctocolors-cjs') // switch to the lighter yoctocolors-cjs to match @inquirer
const { createRawItem } = require('./fileSelector/utils/item.js')
const select = require('@inquirer/select').default
const figures = require('@inquirer/figures').default
const print = (message, /** @type {figures} */ figure = chalk.gray(figures.lineBold)) => console.info(figure ?? chalk.gray(figures.lineBold), message)
const fileSelector = require('./fileSelector/index.js').fileSelector

const CHOICES = {
    SKIP: false, // skip import
    BROWSE: -2 // browse filesystem
}

/**
 * Asks the user if they want to import existing Node-RED flows
 *
 * It presents the user with:
 * * an option to skip the import
 * * a list of suggested flows files (where only 1 flow file is present in the directory)
 * * a list of suggested directories (where multiple flow files are present)
 * * an option to browse the filesystem for flow files
 * @param {Array<string>} [suggestedDirs] - An array of suggested directories to import flows from.
 * @returns {Promise<{skip:Boolean,valid:Boolean,dir:string,dir:string,createdMs:Number,lastModifiedMs:Number,name:string,path:string,packageFile:string}|false>} - Returns an object with details of the selected flows file or false if skipped.
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
    const importableFlowFileChoices = []
    const flowDirectoryChoices = []
    let defaultChoice = CHOICES.SKIP

    // Scan the suggested directories for flow files
    suggestedDirDetails.forEach(dirDetails => {
        const flowsCount = dirDetails.flowFiles.length
        if (flowsCount === 1) {
            // since there is only one flow file in this suggested directory, we can present that
            // as a choice instead of presenting it as a directory containing a single flow file
            const flowsFileDetails = dirDetails.flowFiles[0]
            const flowFile = createRawItem(flowsFileDetails.flowsFile)
            const option = {
                name: `Import flow file: "${flowFile.path}"`,
                value: {
                    ...flowFile,
                    ...flowsFileDetails
                },
                description: 'Press <enter> to import this flow (' + getFlowFileDescription(flowFile, flowsFileDetails) + ')'
            }
            if (!defaultChoice) {
                defaultChoice = option.value
            }
            importableFlowFileChoices.push(option)
        } else if (flowsCount > 1) {
            flowDirectoryChoices.push({
                name: `Browse flows in : "${dirDetails.userDir}"...`,
                value: dirDetails,
                description: `Press <enter> to browse this directory (contains ${flowsCount} Node-RED flows file${flowsCount > 1 ? 's' : ''})`
            })
        }
    })

    // Setup the choices for the select prompt
    choices.push({
        name: 'Skip import',
        value: CHOICES.SKIP,
        description: 'Press <enter> to skip import'
    })
    choices.push(...importableFlowFileChoices)
    choices.push(...flowDirectoryChoices)
    choices.push({
        name: 'Browse filesystem for flows...',
        value: CHOICES.BROWSE,
        description: 'Press <enter> to browse the filesystem for Node-RED flows files'
    })
    console.info()

    // Present the options to the user
    choice = await select({
        message: 'Import existing Node-RED flows?',
        choices,
        default: defaultChoice,
        pageSize: 10,
        instructions: { navigation: chalk.gray('Use arrow keys to select an option, press <enter> to confirm') }
    })
    const suggestedFlowChosen = choice?.isFlowsFile === true
    const suggestedDirChosen = choice && !suggestedFlowChosen && suggestedDirDetails.find(dir => dir.userDir === choice.userDir && dir.valid)
    if (choice === CHOICES.BROWSE || suggestedDirChosen || suggestedFlowChosen) {
        if (!suggestedFlowChosen) {
            // no single flow file was chosen, so we need to browse for a flow file
            choice = await askBrowseForFlowFile(suggestedDirChosen ? suggestedDirChosen.userDir : null)
        }
        if (!choice || choice === 'canceled') {
            return CHOICES.SKIP
        }
        return {
            ...choice,
            valid: true,
            skip: false,
            packageFile: path.join(choice.dir, 'package.json')
        }
    }
    return CHOICES.SKIP
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
            const itemDetails = itemInfo[item.path]
            return getFlowFileDescription(item, itemDetails)
        }
    })
    return selectedOption
}

function getFlowFileDescription (item, itemDetails) {
    if (!item || !item.path) {
        return 'No details available for this item'
    }
    const lastModifiedDate = new Date(item.lastModifiedMs).toLocaleString().replace(', ', ' ')
    const sizeInKB = (item.size / 1024).toFixed(2)
    let sizeString = `, ${sizeInKB} KB`
    if (sizeInKB > 1024) {
        sizeString = `, ${(sizeInKB / 1024).toFixed(2)} MB`
    }
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
                print('Could not determine the credentials secret. Flows will be imported without credentials.', chalk.yellow(figures.warning))
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
    askBrowseForFlowFile,
    getDirDetails,
    getFlowFiles,
    getFlowsFileDetails,
    flowImport
}
