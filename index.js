#!/usr/bin/env node
const commandLineArgs = require('command-line-args')
const { Pinger } = require('./lib/pinger.js')
const { initLogger, info, debug } = require('./lib/log')
let options

try {
    options = commandLineArgs(require('./lib/args'))
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
    console.log(require('./lib/usage').usage())
    process.exit(0)
}

try {
    const configuration = require('./lib/config').config(options)
    initLogger(configuration)

    info('FlowForge Device Agent')
    info(`Version: ${configuration.version}`)
    info(`Device: ${configuration.deviceId}`)
    info(`ForgeURL: ${configuration.forgeURL}`)

    debug(configuration)

    const pinger = Pinger(configuration)
    // process.on('exit', (code) => { console.log('EXIT', code); pinger.stop() })
    process.on('SIGINT', () => { pinger.stop() })
    pinger.start()
} catch (err) {
    console.log(err.message)
    process.exit(-1)
}
