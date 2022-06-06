const fs = require('fs')
const path = require('path')
const yaml = require('yaml')

module.exports = {
    config: options => {
        // Require dir to be created
        if (!fs.existsSync(options.dir)) {
            throw new Error(`Cannot find dir '${options.dir}'.
Please ensure it exists and is writable, or set a different path with -u`)
        }

        // Locate the config file. Either the path exactly as specified,
        // or relative to dir
        let configPath = options.config
        if (!fs.existsSync(configPath)) {
            configPath = path.join(options.dir, configPath)
            if (!fs.existsSync(configPath)) {
                throw new Error(`Cannot find config file '${options.config}'
Tried:
 - ${options.config}
 - ${configPath}`)
            }
        }

        // Load the config file
        let localConfig = {}
        try {
            localConfig = yaml.parse(fs.readFileSync(configPath, 'utf8'))
        } catch (err) {
            throw new Error(`Failed to parse config file: ${err.toString()}`)
        }

        // Validate localConfig
        const missing = []
        ;['deviceId', 'token', 'credentialSecret', 'forgeURL'].forEach(opt => {
            if (!localConfig[opt]) {
                missing.push(opt)
            }
        })
        if (missing.length > 0) {
            const missingList = missing.map(v => ` - ${v}`).join('\n')
            throw new Error(`Config file missing required options:\n${missingList}`)
        }

        delete options.config

        localConfig.version = require('../package.json').version

        return {
            ...localConfig,
            ...options
        }
    }
}
