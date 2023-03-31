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

let options

try {
    options = commandLineArgs(require('./lib/cli/args'))
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
    quit(quitMsg, 9) // Exit Code 9, Invalid Argument
}

// Locate the config file. Either the path exactly as specified,
// or relative to dir
let deviceFile = options.config
if (!fs.existsSync(deviceFile)) {
    deviceFile = path.join(options.dir, deviceFile)
    if (!fs.existsSync(deviceFile)) {
        const quitMsg = `Cannot find config file '${options.config}'
Tried:
- ${options.config}
- ${deviceFile}`
        quit(quitMsg, 9) // Exit Code 9, Invalid Argument
    }
}

// Continue setting up the agent/agentManager
options.deviceFile = deviceFile
delete options.config

info('FlowForge Device Agent')
info('----------------------')

AgentManager.init(options)

process.on('SIGINT', closeAgentAndQuit)
process.on('SIGTERM', closeAgentAndQuit)
process.on('SIGQUIT', closeAgentAndQuit)

AgentManager.startAgent()

async function closeAgentAndQuit (msg, errCode = 0) {
    if (AgentManager) { await AgentManager.close() }
    quit(msg, errCode)
}

function quit (msg, errCode = 0) {
    if (msg) { console.log(msg) }
    process.exit(errCode)
}
