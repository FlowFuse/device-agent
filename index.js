#!/usr/bin/env node
const semver = require('semver')
if (semver.lt(process.version, '16.0.0')) {
    console.log('FlowForge Device Agent requires at least NodeJS v16')
    quit()
}

const commandLineArgs = require('command-line-args')
const { info } = require('./lib/log')
const path = require('path')
const fs = require('fs')
const { AgentManager } = require('./lib/AgentManager')
const { WebServer } = require('./frontend/server')
const ConfigLoader = require('./lib/config')
const webServer = new WebServer()
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

delete options.config
AgentManager.init(options)

info('FlowForge Device Agent')
info('----------------------')

if (options.webmin) {
    info('Starting Config Web Server')
    if (!options.webminUser || !options.webminPass) {
        quit('Config Web Server cannot run without a username and password. These are set via with --webmin-user and --webmin-pass', 1) // Exit Code 1 - 1 Operation not permitted
    }
    const opts = {
        port: options.webminPort || 1879,
        host: options.webminHost || '0.0.0.0',
        credentials: {
            username: options.webminUser,
            password: options.webminPass
        },
        runtime: options.webminRuntime || 10,
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

async function closeAgentAndQuit (msg, errCode = 0) {
    if (AgentManager) { await AgentManager.close() }
    quit(msg, errCode)
}

function quit (msg, errCode = 0) {
    if (msg) { console.log(msg) }
    process.exit(errCode)
}
