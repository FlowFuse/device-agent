#!/usr/bin/env node
const commandLineArgs = require('command-line-args')
const { Agent } = require('./lib/agent.js')
const { initLogger, info, debug } = require('./lib/log')
const semver = require('semver')
let options

try {
    options = commandLineArgs(require('./lib/cli/args'))
    options = options._all
} catch (err) {
    console.log(err.toString())
    console.log('Run with -h for help')
    process.exit(0)
}
if (options.version) {
    console.log(require('./package.json').version)
    process.exit(0)
}
if (options.help) {
    console.log(require('./lib/cli/usage').usage())
    process.exit(0)
}

if (semver.lt(process.version, '16.0.0')) {
    console.log('FlowForge Device Agent requires at least NodeJS v16')
    process.exit(0)
}

try {
    const configuration = require('./lib/config').config(options)
    initLogger(configuration)

    info('FlowForge Device Agent')
    info(`Version: ${configuration.version}`)
    info(`Device: ${configuration.deviceId}`)
    info(`ForgeURL: ${configuration.forgeURL}`)

    debug({
        ...configuration,
        ...{
            // Obscure any token/password type things from the log
            token: configuration.token ? '*******' : undefined,
            brokerPassword: configuration.brokerPassword ? '*******' : undefined,
            credentialSecret: configuration.credentialSecret ? '*******' : undefined
        }
    })

    const agent = Agent(configuration)
    // process.on('exit', (code) => { console.log('EXIT', code); pinger.stop() })
    process.on('SIGINT', () => { agent.stop() })
    agent.start()
} catch (err) {
    console.log(err.message)
    process.exit(-1)
}
