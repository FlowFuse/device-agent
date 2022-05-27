#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const yaml = require('yaml')
const commandLineArgs = require('command-line-args')
const { Pinger } = require('./lib/pinger.js');

(async () => {
    const cmdLineArgs = [
        { name: 'config', alias: 'c', type: String, defaultValue: 'device.yml' },
        { name: 'userDir', alias: 'u', type: String, defaultValue: 'var/project' },
        { name: 'interval', alias: 'i', type: Number, defaultValue: 30 },
        { name: 'port', alias: 'p', type: Number }
    ]

    const options = commandLineArgs(cmdLineArgs)
    let configPath

    if (options.config) {
        if (options.config.startsWith('/')) {
            configPath = options.config
        } else {
            configPath = path.join(__dirname, options.config)
        }
        delete options.config
        if (options.userDir) {
            if (!options.userDir.startsWith('/')) {
                options.userDir = path.join(__dirname, options.userDir)
            }
            if (!fs.existsSync(options.userDir)) {
                console.log(`creating userDir ${options.userDir}`)
                fs.mkdirSync(options.userDir, true)
            }
        }
        if (!fs.existsSync(configPath)) {
            console.log(`Config file (${configPath}) not found`)
            process.exit(-1)
        }

        const config = {
            ...yaml.parse(fs.readFileSync(configPath, 'utf8')),
            ...options
        }

        if (!config.port) {
            config.port = 1880
        }

        const packageJSON = require('./package.json')
        config.deviceAgentVersion = packageJSON.version

        // console.log(config)
        const pinger = new Pinger(config)

        process.on('exit', pinger.stop.bind(pinger))
        process.on('SIGINT', pinger.stop.bind(pinger))
    } else {
        console.log('No config file passed')
        process.exit(1)
    }
})()
