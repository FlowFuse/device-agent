const fs = require('fs')
const yaml = require('yaml')

/**
 * @typedef ConfigOptions
 * @property {string} deviceFile - The path to the device config file
 * @property {string} [provisioningToken] - The provisioning token
 * @property {string} [forgeURL] - The forge URL
 * @property {string} [provisioningTeam] - The provisioning team
 * @property {string} [deviceId] - The device ID
 * @property {string} [credentialSecret] - The credential secret
 * @property {string} [deviceName] - The device name
 * @property {string} [deviceType] - The device type
 * @property {string} [deviceVersion] - The device version
 * @property {string} [deviceDescription] - The device description
 * @property {string} [brokerURL] - The broker URL
 * @property {string} [brokerUsername] - The broker username
 * @property {string} [brokerPassword] - The broker password
 * @property {object} [httpNodeAuth] - The HTTP node auth
 * @property {string} [httpNodeAuth.user] - The HTTP node auth user
 * @property {string} [httpNodeAuth.pass] - The HTTP node auth password
*/

const defaults = {
    port: 1880,
    ui: false,
    uiHost: '0.0.0.0',
    uiPort: 1879
}

module.exports = {
    parseDeviceConfigFile,
    parseDeviceConfig,
    config,
    defaults
}

/**
 * Load and parse the device file specified
 * @param {string} deviceFile - The path to the device config file
 * @returns {{ deviceConfig: Object, message: string, valid: boolean }} - The parsed options and device config file data
 */
function parseDeviceConfigFile (deviceFile) {
    let config
    try {
        config = yaml.parse(fs.readFileSync(deviceFile, 'utf8'))
    } catch (err) {
        return {
            valid: false,
            message: `Failed to parse config file: ${err.toString()}`,
            deviceConfig: {}
        }
    }
    if (!config) {
        return {
            valid: false,
            message: 'Config file is empty',
            deviceConfig: {}
        }
    }
    const result = parseDeviceConfig(config)
    if (result.deviceConfig) {
        // deviceConfig may be null if the config file is empty or invalid
        // so only set the deviceFile if we have a valid deviceConfig
        result.deviceConfig.deviceFile = deviceFile
    }
    return result
}

function parseDeviceConfig (deviceConfig) {
    const result = {
        valid: false,
        message: '',
        deviceConfig: null
    }

    if (typeof deviceConfig === 'string') {
        try {
            deviceConfig = yaml.parse(deviceConfig)
        } catch (err) {
            result.message = `Failed to parse config file: ${err.toString()}`
            return result
        }
    }

    if (typeof deviceConfig !== 'object' || deviceConfig === null) {
        result.message = 'Config file is empty'
        return result
    }

    // default the config
    const localConfig = {
        provisioningMode: false,
        token: '',
        forgeURL: '',
        deviceId: '',
        credentialSecret: ''
    }

    // Validate localConfig
    const missing = []
    if (deviceConfig.provisioningToken) {
        localConfig.provisioningMode = true
        localConfig.token = deviceConfig.provisioningToken
        delete deviceConfig.provisioningToken
        ;['forgeURL', 'provisioningTeam'].forEach(opt => {
            if (!deviceConfig[opt]) {
                missing.push(opt)
            }
        })
    } else {
        ;['deviceId', 'token', 'credentialSecret', 'forgeURL'].forEach(opt => {
            if (!deviceConfig[opt]) {
                missing.push(opt)
            }
        })
        if (deviceConfig.brokerURL) {
            ;['brokerUsername', 'brokerPassword'].forEach(opt => {
                if (!deviceConfig[opt]) {
                    missing.push(opt)
                }
            })
        }
    }

    if (deviceConfig.httpNodeAuth) {
        if (!deviceConfig.httpNodeAuth.user) {
            missing.push('httpNodeAuth.user')
        } else if (!deviceConfig.httpNodeAuth.pass) {
            missing.push('httpNodeAuth.pass')
        } else {
            localConfig.httpNodeAuth = {
                user: deviceConfig.httpNodeAuth.user,
                pass: deviceConfig.httpNodeAuth.pass
            }
        }
    }

    if (missing.length > 0) {
        const missingList = missing.map(v => ` - ${v}`).join('\n')
        result.message = `Config file missing required options:\n${missingList}`
        return result
    }
    // merge deviceConfig into localConfig
    Object.assign(localConfig, deviceConfig)
    result.valid = true
    result.deviceConfig = {
        ...localConfig
    }
    return result
}

/**
 * Verify configuration options, load and verify the device config file
 * @param {object} options Configuration options
 * @returns Loaded configuration
 */
function config (options) {
    const parsedOptions = parseDeviceConfigFile(options.deviceFile)
    if (!parsedOptions.valid) {
        throw new Error(parsedOptions.message)
    }

    delete parsedOptions.config

    const version = require('../package.json').version

    const result = {
        version,
        ...defaults,
        ...parsedOptions.deviceConfig,
        ...options
    }

    if (parsedOptions.deviceConfig.provisioningMode) {
        let provisioningExtras = null
        provisioningExtras = {
            ...parsedOptions.deviceConfig
        }
        const excludeProps = ['provisioningMode', 'provisioningName', 'provisioningTeam', 'provisioningToken', 'token', 'forgeURL', 'deviceId', 'credentialSecret', 'deviceFile', 'brokerURL', 'brokerUsername', 'brokerPassword', 'autoProvisioned', 'cliSetup']
        for (const prop of excludeProps) {
            delete provisioningExtras[prop]
        }
        result.provisioningExtras = provisioningExtras
    }

    return result
}
