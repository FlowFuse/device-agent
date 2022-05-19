#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const yaml = require('yaml')
const commandLineArgs = require('command-line-args')
const { Launcher } = require('./lib/launcher.js');
// const { Pinger } = require('./lib/pinger.js')

(async () => {
    const cmdLineArgs = [
        { name: 'config', alias: 'c', type: String, defaultValue: 'device.yml' },
        { name: 'userDir', alias: 'u', type: String, defaultValue: 'var/project' },
        { name: 'interval', alias: 'i', type: Number, defaultValue: 30 },
        { name: 'project', alias: 'p', type: String, defaultOption: true }
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
        console.log(config)
        // const pinger = new Pinger(config)

        /* all the following needs moving to something triggered by
         * downloading the latest project state
         */

        const project = JSON.parse(fs.readFileSync(config.project))
        const launcher = new Launcher(config, project)
        await launcher.writeNodes()
        await launcher.writeFlow()
        await launcher.writeCredentials()
        await launcher.writeSettings()
        await launcher.start()

        // process.on('exit', launcher.stop)
        process.on('SIGINT', launcher.stop)
    }
})()
