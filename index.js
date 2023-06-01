#!/usr/bin/env node
const semver = require('semver')
if (semver.lt(process.version, '16.0.0')) {
    console.log('FlowForge Device Agent requires at least NodeJS v16')
    process.exit(1)
}

const TESTING = process.env.NODE_ENV === 'test'
const commandLineArgs = require('command-line-args')
const { info } = require('./lib/log')
const path = require('path')
const fs = require('fs')
const { AgentManager } = require('./lib/AgentManager')
const { WebServer } = require('./frontend/server')
const ConfigLoader = require('./lib/config')
const webServer = new WebServer()

function main (testOptions) {
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
        console.log(require('./package.json').version)
        quit()
    }
    if (options.help) {
        console.log(require('./lib/cli/usage').usage())
        quit()
    }

    if (!path.isAbsolute(options.dir)) {
        options.dir = path.join(process.cwd(), options.dir)
    }

    // Require dir to be created
    if (!fs.existsSync(options.dir)) {
        const quitMsg = `Cannot find dir '${options.dir}'.
    Please ensure it exists and is writable, or set a different path with -d`
        quit(quitMsg, 20) // Exit Code 20 - Invalid dir
        // REF: https://slg.ddnss.de/list-of-common-exit-codes-for-gnu-linux/
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

    info('FlowForge Device Agent')
    info('----------------------')

    if (options.webmin) {
        info('Starting Config Web Server')
        if (!options.webminUser || !options.webminPass) {
            quit('Config Web Server cannot run without a username and password. These are set via with --webmin-user and --webmin-pass', 2)
        }
        const webminRuntime = Number(options.webminRuntime)
        if (isNaN(webminRuntime) || webminRuntime === Infinity || webminRuntime < 0) {
            quit('Config Web Server runtime must be 0 or greater', 2)
        }
        const opts = {
            port: options.webminPort || 1879,
            host: options.webminHost || '0.0.0.0',
            credentials: {
                username: options.webminUser,
                password: options.webminPass
            },
            runtime: webminRuntime,
            dir: options.dir,
            config: options.config,
            deviceFile: options.deviceFile
        }
        webServer.initialize(AgentManager, opts)
        webServer.start().then(() => {
            info('Config Web Server started')
        }).catch((err) => {
            info(`Config Web Server failed to start: ${err.message}`)
        })
    }

    process.on('SIGINT', closeAgentAndQuit)
    process.on('SIGTERM', closeAgentAndQuit)
    process.on('SIGQUIT', closeAgentAndQuit)

    const parsedConfig = configFound && (ConfigLoader.parseDeviceConfigFile(options.deviceFile) || { valid: false })
    const isValidDeviceConfig = !!parsedConfig.valid

    if (isValidDeviceConfig) {
        AgentManager.startAgent()
    } else if (configFound && options.webmin === true) {
        info(`Invalid config file '${options.deviceFile}'.`)
    } else if (!configFound && options.webmin === true) {
        info(`No config file found at '${deviceFile1}' or '${deviceFile2}'`)
    } else {
        if (configFound) {
            quit(`Invalid config file '${options.deviceFile}': ${parsedConfig?.message || 'Unknown error'}'.`, 9) // Exit Code 9 - Invalid config file
        } else {
            quit(`No config file found at '${deviceFile1}' or '${deviceFile2}'`, 2) // No such file or directory
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
            options
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
