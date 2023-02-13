const fs = require('fs')
const yaml = require('yaml')

module.exports = {
    config: options => {
        // Load the config file
        const localConfig = {
            deviceFile: options.deviceFile,
            provisioningMode: false,
            token: '',
            forgeURL: '',
            deviceId: '',
            credentialSecret: ''
        }
        let fileConfig
        try {
            fileConfig = yaml.parse(fs.readFileSync(localConfig.deviceFile, 'utf8'))
        } catch (err) {
            throw new Error(`Failed to parse config file: ${err.toString()}`)
        }

        // Validate localConfig
        const missing = []
        if (fileConfig.provisioningToken) {
            localConfig.provisioningMode = true
            localConfig.token = fileConfig.provisioningToken
            delete fileConfig.provisioningToken
            ;['forgeURL', 'provisioningTeam'].forEach(opt => {
                if (!fileConfig[opt]) {
                    missing.push(opt)
                }
            })
        } else {
            ;['deviceId', 'token', 'credentialSecret', 'forgeURL'].forEach(opt => {
                if (!fileConfig[opt]) {
                    missing.push(opt)
                }
            })
            if (fileConfig.brokerURL) {
                ;['brokerUsername', 'brokerPassword'].forEach(opt => {
                    if (!fileConfig[opt]) {
                        missing.push(opt)
                    }
                })
            }
        }

        if (missing.length > 0) {
            const missingList = missing.map(v => ` - ${v}`).join('\n')
            throw new Error(`Config file missing required options:\n${missingList}`)
        }
        delete options.config

        localConfig.version = require('../package.json').version

        // merge fileConfig into localConfig
        Object.assign(localConfig, fileConfig)

        return {
            ...localConfig,
            ...options
        }
    }
}
