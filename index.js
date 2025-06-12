#!/usr/bin/env node
const semver = require('semver')
if (semver.lt(process.version, '14.0.0')) {
    console.log('FlowFuse Device Agent requires at least NodeJS v14.x')
    process.exit(1)
}

const TESTING = process.env.NODE_ENV === 'test'
const commandLineArgs = require('command-line-args')
const { info, warn } = require('./lib/log')
const { hasProperty } = require('./lib/utils')
const path = require('path')
const fs = require('fs')
const { AgentManager } = require('./lib/AgentManager')
const { WebServer } = require('./frontend/server')
const ConfigLoader = require('./lib/config')
const webServer = new WebServer()
const figures = require('@inquirer/figures').default
const confirm = require('@inquirer/confirm').default
const print = (message, /** @type {figures} */ figure = chalk.gray(figures.lineBold)) => console.info(figure ?? chalk.gray(figures.lineBold), message)
const flowImport = require('./lib/cli/flowsImporter').flowImport
const { OLD_PROJECT_FILE, PROJECT_FILE } = require('./lib/agent')
const chalk = require('yoctocolors-cjs') // switch to the lighter yoctocolors-cjs to match @inquirer

function main (testOptions) {
    const pkg = require('./package.json')
    if (pkg.name === '@flowforge/flowforge-device-agent') {
        console.log(`
**************************************************************************
* The FlowFuse Device Agent is moving to '@flowfuse/device-agent' on npm *
* and 'flowfuse/device-agent' on DockerHub. Please upgrade to the new    *
* packages to ensure you continue to receive updates.                    *
* See https://flowfuse.com/docs/device-agent/install/ for details        *
**************************************************************************
`)
    }

    let options

    try {
        options = commandLineArgs(require('./lib/cli/args'), { camelCase: true })
        options = options._all
    } catch (err) {
        console.log(err.toString())
        console.log('Run with -h for help')
        quit()
    }
    if (options.version) {
        console.log(pkg.version)
        quit()
    }
    if (options.help) {
        console.log(require('./lib/cli/usage').usage())
        quit()
    }

    // Configure silent mode
    let installerMode = false
    if (options.installerMode) {
        installerMode = true
    }

    if (options.dir === '') {
        // No dir has been explicitly set, so we need to set the default.
        // 1. Use `/opt/flowforge-device` if it exists
        // 2. Otherwise use `/opt/flowfuse-device`
        if (fs.existsSync('/opt/flowforge-device')) {
            options.dir = '/opt/flowforge-device'
        } else {
            options.dir = '/opt/flowfuse-device'
        }
    }

    if (!path.isAbsolute(options.dir)) {
        options.dir = path.join(process.cwd(), options.dir)
    }

    // Require dir to be created
    if (!fs.existsSync(options.dir)) {
        try {
            fs.mkdirSync(options.dir, { recursive: true })
            if (!fs.existsSync(options.dir)) {
                throw new Error('Failed to create dir')
            }
        } catch (err) {
            const quitMsg = `Cannot create dir '${options.dir}'.
Please ensure the parent directory is writable, or set a different path with -d`
            quit(quitMsg, 20) // Exit Code 20 - Invalid dir
            // REF: https://slg.ddnss.de/list-of-common-exit-codes-for-gnu-linux/
            return
        }
    }

    // Locate the config file. Either the path exactly as specified,
    // or relative to dir

    let configFound = false
    const deviceFile1 = options.config || 'device.yaml'
    const deviceFile2 = path.join(options.dir, deviceFile1)
    if (fs.existsSync(deviceFile1)) {
        configFound = true
        options.deviceFile = deviceFile1
    } else if (fs.existsSync(deviceFile2)) {
        configFound = true
        options.deviceFile = deviceFile2
    }

    // If the config file is not found, set the `deviceFile` to the default value
    // ready for when the config file is created.
    if (!configFound) {
        options.deviceFile = deviceFile2 // deviceFile2 is the default value
    }

    delete options.config
    AgentManager.init(options)

    if (hasProperty(options, 'otc') || hasProperty(options, 'ffUrl')) {
        // Quick Connect mode
        if (!options.otc || options.otc.length < 8) {
            // 8 is the minimum length of an OTC
            // e.g. ab-cd-ef
            warn('Device setup requires parameter --otc to be 8 or more characters')
            quit(null, 2)
        }
        console.info()
        print('Setting up your device...', chalk.gray(figures.bullet))
        if (!options.ffUrl) {
            warn('Device setup requires parameter --ff-url to be set')
            quit(null, 2)
        }
        let deviceSettings = null
        AgentManager.quickConnectDevice().then((provisioningData) => {
            deviceSettings = provisioningData
            if (!deviceSettings) {
                print('Device setup was unsuccessful', chalk.redBright(figures.cross))
                quit(null, 2)
            }
            const runCommandInfo = ['flowfuse-device-agent']
            if (options.dir !== '/opt/flowfuse-device') {
                runCommandInfo.push(`-d ${options.dir}`)
            }
            if (installerMode) {
                print('Success!', chalk.green(figures.tick))
            } else {
                print('Success!', chalk.green(figures.tick))
                print('This Device can be launched at any time using the following command:')
                print(runCommandInfo.join(' '), ' ')
            }
            if (!options.otcNoImport) {
                // Support for importing flows during initial state check-in was added after 2.16.0.
                // Use semver.coerce to validate the ffVersion. This will, by default, strip off suffixes to ensure
                // a clean x.y.z comparison.
                const ffVersion = semver.coerce(deviceSettings.meta?.ffVersion || '0.0.0') // Strip suffixes like -beta.1
                const ffSupportsImport = (ffVersion && semver.gt(ffVersion, '2.16.0'))

                if (ffSupportsImport) {
                    const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '/'
                    const parentOfHome = path.dirname(home)
                    const root = path.parse(parentOfHome).root
                    const homeNodeRed = path.join(home, '.node-red')
                    const rootNodeRed1 = path.join(root, 'node-red')
                    const rootNodeRed2 = path.join(root, '.node-red')
                    const rootNodeRed3 = path.join(root, 'nodered')
                    const rootNodeRed4 = path.join(root, 'data') // common location for Node-RED data
                    const suggestedDirs = [homeNodeRed, rootNodeRed1, rootNodeRed2, rootNodeRed3, rootNodeRed4]

                    try {
                        // get an array of .node-red dirs in the home directories
                        const parentDirNodeRedDirs = fs.readdirSync(parentOfHome, { withFileTypes: true })
                            .filter(dir => dir.isDirectory())
                            .map(dir => path.join(parentOfHome, dir.name, '.node-red'))
                            .filter(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory())
                        suggestedDirs.push(...parentDirNodeRedDirs)
                    } catch (_err) {
                        // If we can't read the parent directory, just ignore it
                    }
                    // add common locations for FlowFuse Device Agent projects flows
                    suggestedDirs.push(path.join('/opt/flowfuse-device/project'))
                    suggestedDirs.push(path.join('/opt/flowforge-device/project'))
                    // if provided, add the dir option as a suggested directory
                    if (options.dir) {
                        suggestedDirs.push(options.dir)
                        suggestedDirs.push(path.join(options.dir, 'project'))
                    }
                    const absoluteSuggestedDirs = suggestedDirs.map(dir => path.resolve(dir)) // absolute paths
                    const uniqueSuggestedDirs = [...new Set(absoluteSuggestedDirs)]
                    return flowImport(uniqueSuggestedDirs)
                }
            }
            return Promise.resolve()
        }).then((importOptions) => {
            if (importOptions) {
                const deviceConfig = {
                    flows: importOptions.flows || [],
                    credentials: importOptions.credentials || {},
                    package: importOptions.package || {}
                }
                print('Uploading snapshot as the target for this Device...')
                return AgentManager.postState(
                    { token: deviceSettings.credentials.token, deviceId: deviceSettings.id, forgeURL: options.ffUrl },
                    {
                        provisioning: {
                            deviceConfig,
                            credentialSecret: importOptions.credentialSecret,
                            description: `Flows imported from '${importOptions.flowsFile}' at ${new Date().toISOString()}`,
                            name: 'Existing Flows Imported'
                        },
                        agentVersion: pkg.version,
                        state: 'provisioning'
                    }
                )
            }
            return Promise.resolve()
        }).then((importResponse) => {
            if (importResponse) {
                if (importResponse.statusCode === 200) {
                    // at this point, flowImport has successfully created a snapshot on the platform - we can safely clean up the local files
                    // check to see if project dir exists & if so, clean it up
                    const projectDir = path.join(options.dir, 'project')
                    if (fs.existsSync(projectDir)) {
                        print('Cleaning up existing project directory...')
                        fs.rmSync(projectDir, { force: true, recursive: true })
                    }
                    let projectJson = path.join(options.dir, OLD_PROJECT_FILE)
                    if (fs.existsSync(projectJson)) {
                        print('Cleaning up existing project file...')
                        fs.rmSync(projectJson, { force: true })
                    }
                    projectJson = path.join(options.dir, PROJECT_FILE)
                    if (fs.existsSync(projectJson)) {
                        print('Cleaning up existing project file...')
                        fs.rmSync(projectJson, { force: true })
                    }
                    print('Success!', chalk.green(figures.tick))
                } else {
                    print(`Snapshot import was unsuccessful (${importResponse.statusCode})`, chalk.redBright(figures.cross))
                }
            }
            // If the user has set otcNoStart, then we don't want to start the agent
            console.info()
            if (!options.otcNoStart) {
                return confirm({ message: 'Do you want to start the Device Agent now?' })
            } else {
                quit()
            }
        }).then((startNow) => {
            if (startNow) {
                console.info()
                info('Starting Device Agent with new configuration')
                delete options.otc
                delete options.ffUrl
                options.deviceFile = path.join(options.dir, 'device.yml')
                start(options, true)
            } else {
                console.info()
                quit()
            }
        }).catch((err) => {
            console.info()
            quit(err.message, 2)
        })
        return
    }

    start(options, configFound)

    function start (options, configFound) {
        info('FlowFuse Device Agent')
        info('----------------------')

        if (options.ui) {
            info('Starting Web UI')
            if (!options.uiUser || !options.uiPass) {
                quit('Web UI cannot run without a username and password. These are set via with --ui-user and --ui-pass', 2)
            }
            const uiRuntime = Number(options.uiRuntime)
            if (isNaN(uiRuntime) || uiRuntime === Infinity || uiRuntime < 0) {
                quit('Web UI runtime must be 0 or greater', 2)
            }
            const opts = {
                port: options.uiPort || 1879,
                host: options.uiHost || '0.0.0.0',
                credentials: {
                    username: options.uiUser,
                    password: options.uiPass
                },
                runtime: uiRuntime,
                dir: options.dir,
                config: options.config,
                deviceFile: options.deviceFile
            }
            webServer.initialize(AgentManager, opts)
            webServer.start().then().catch((err) => {
                info(`Web UI failed to start: ${err.message}`)
            })
        }

        process.on('SIGINT', closeAgentAndQuit)
        process.on('SIGTERM', closeAgentAndQuit)
        process.on('SIGQUIT', closeAgentAndQuit)

        const parsedConfig = configFound && (ConfigLoader.parseDeviceConfigFile(options.deviceFile) || { valid: false })
        const isValidDeviceConfig = !!parsedConfig.valid

        if (isValidDeviceConfig) {
            AgentManager.startAgent()
        } else if (configFound && options.ui === true) {
            info(`Invalid config file '${options.deviceFile}'.`)
        } else if (!configFound && options.ui === true) {
            info(`No config file found at '${deviceFile1}' or '${deviceFile2}'`)
        } else {
            if (configFound) {
                quit(`Invalid config file '${options.deviceFile}': ${parsedConfig?.message || 'Unknown error'}'.`, 9) // Exit Code 9 - Invalid config file
            } else {
                quit(`No config file found at '${deviceFile1}' or '${deviceFile2}'`, 2) // No such file or directory
            }
        }
    }

    function quit (msg, errCode = 0) {
        if (msg) { console.log(msg) }
        if (TESTING) {
            // don't exit if we are testing. Instead, call the onExit callback stub
            if (testOptions?.onExit) {
                testOptions.onExit(msg, errCode)
            }
        } else {
            process.exit(errCode)
        }
    }

    async function closeAgentAndQuit (msg, errCode = 0) {
        if (AgentManager) { await AgentManager.close() }
        quit(msg, errCode)
    }

    if (TESTING) {
        return {
            AgentManager,
            webServer,
            options: {
                ...ConfigLoader.defaults,
                ...options
            }
        }
    }
    return null
}

// if we are testing, export the main function so we can call it directly, otherwise call it now
if (TESTING) {
    module.exports = { main }
} else {
    main()
}
