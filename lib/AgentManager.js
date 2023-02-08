// AgentManager: A class that manages the device agent.
// It can start/stop and reload the agent

const { initLogger, info, warn, debug } = require('./log')
const { default: got } = require('got/dist/source')
const agent = require('./agent')
const os = require('os')
const path = require('path')
const fsExtra = require('fs-extra')
const yaml = require('yaml')

class AgentManager {
    static options = null
    constructor () {
        if (AgentManager.options) {
            throw new Error('Agent Manager already instantiated')
        }
        this.init({})
        /** @type {import('./agent.js').Agent} */
        this.agent = null
        this.configuration = null
    }

    init = (options) => {
        AgentManager.options = options
        this._state = 'unknown'
        this.agent = null
        this.configuration = null
        return this
    }

    get options () {
        return AgentManager.options
    }

    get state () {
        if (this.exiting) { return 'exiting' }
        return this._state
    }

    set state (state) {
        if (this._state === 'exiting') { return } // dont update state once set to exiting
        this._state = state
    }

    get exiting () {
        return this._state === 'exiting'
    }

    async reloadConfig () {
        if (this.exiting) { return }
        if (!this.options) {
            throw new Error('Agent Manager not initialised')
        }
        this.configuration = require('./config').config(this.options)
        initLogger(this.configuration)
    }

    async startAgent () {
        if (this.exiting) { return this.state }
        if (!this.options) {
            throw new Error('Agent Manager not initialised')
        }
        if (this.state === 'starting' || this.state === 'started') {
            return this.state
        }
        this.state = 'starting'
        info('Agent starting...')
        try {
            this.reloadConfig()
            info(`Version: ${this.configuration.version}`)
            if (this.configuration.provisioningMode) {
                info('Mode: Provisioning Mode')
            } else {
                info('Mode: Device Mode')
                info(`Device: ${this.configuration.deviceId}`)
            }
            info(`ForgeURL: ${this.configuration.forgeURL}`)

            debug({
                ...this.configuration,
                ...{
                    // Obscure any token/password type things from the log
                    token: this.configuration.token ? '*******' : undefined,
                    brokerPassword: this.configuration.brokerPassword ? '*******' : undefined,
                    credentialSecret: this.configuration.credentialSecret ? '*******' : undefined
                }
            })
            if (this.exiting) { return this.state }
            this.agent = agent.newAgent(this.configuration)
            this.agent.AgentManager = this
            if (this.exiting) {
                this.agent && await this.agent.stop()
                return this.state
            }
            this.state = await this.agent.start() || 'started'
            return this.state
        } catch (err) {
            console.log(err.message)
            process.exit(-1)
        }
    }

    async stopAgent () {
        if (this.agent) {
            this.state = 'stopping'
            await this.agent.stop()
        }
        this.state = 'stopping'
        return true
    }

    async close () {
        this.state = 'exiting'
        if (this.agent) {
            await this.agent.stop()
            this.agent.AgentManager = null
            this.agent = null
        }
        return true
    }

    /**
     *
     * @param {Number} delay - delay in milliseconds after stopping / before restarting the agent
     */
    reloadAgent (delay = 500) {
        if (this.exiting) { return }
        this.state = 'reloading'
        delay = delay || 500
        // on next tick, stop the agent, wait, then start it again
        process.nextTick(async () => {
            await this.stopAgent()
            if (this.exiting) { return }
            await new Promise(resolve => setTimeout(resolve, delay))
            if (this.exiting) { return }
            this.state = await this.startAgent() || 'started'
        }, delay)
    }

    async provisionDevice (provisioningURL, provisioningTeam, provisioningToken) {
        try {
            debug('Provisioning device')

            // sanity check the parameters
            provisioningURL = provisioningURL || this.configuration.forgeURL
            provisioningTeam = provisioningTeam || this.configuration.provisioningTeam
            provisioningToken = provisioningToken || this.configuration.token
            const provisioningConfig = {
                provisioningMode: true,
                provisioningTeam,
                forgeURL: provisioningURL,
                token: provisioningToken
            }

            // before we do anything, check if the device can be provisioned
            // These checks will ensure files are writable and the necessary settings are present
            if (await this.canBeProvisioned(provisioningConfig) !== true) {
                warn('Device cannot be provisioned. Check the logs for more information.')
                this.reloadAgent(6000 /* 60000 */) // reload as the device.yml file may have been fixed or updated
                return false
            }

            // Get the local IP address / MAC / Hostname of the device for use in naming
            const { host, ip, mac } = await this._getDeviceInfo(provisioningConfig.forgeURL)
            const type = 'Auto Provisioned Device'
            const team = provisioningConfig.provisioningTeam
            const name = (host || ip) + (mac ? ` (${mac})` : '')

            // Provision this device in the forge platform and receive the device ID, credentials and other details
            const response = await got.post(`${provisioningConfig.forgeURL}/api/v1/devices`, {
                headers: {
                    'user-agent': `FlowForge Device Agent v${this.configuration?.version || ' unknown'}`,
                    authorization: `Bearer ${provisioningConfig.token}`
                },
                timeout: {
                    request: 10000
                },
                json: { name, type, team }
            })

            if (response.statusCode !== 200) {
                warn(`Problem provisioning device: ${response.statusCode} ${response.statusMessage}`)
                this.reloadAgent(6000 /* 60000 */) // reload as the device.yml file may have been fixed or updated
                return false
            }

            // * At this point, the device is created. We need to update  the config, and restart the
            //   agent. If a problem occurs generating the device.yml, we need to end the program to
            //   avoid generating multiple devices on the platform
            // * FUTURE: If generating the device.yml fails we should probably delete the device we
            //   just created. For now, we use the `canBeProvisioned()` check up front to avoid this problem
            const device = JSON.parse(response.body)
            device.forgeURL ||= provisioningConfig.forgeURL
            await this._provisionDevice(device)
            this.reloadAgent(5000) // reload as the device.yml file may have been fixed or updated
            return true
        } catch (err) {
            warn(`Problem provisioning device: ${err.toString()}`)
            throw err
        }
    }

    async canBeProvisioned (provisioningConfig) {
        try {
            if (!this.options) {
                warn('Agent Manager not initialised. Device cannot be provisioned')
                return false
            }
            const deviceFile = this.options.deviceFile
            if (!deviceFile) {
                warn('Device file not specified. Device cannot be provisioned')
                return false
            }
            if (!provisioningConfig || !provisioningConfig.provisioningMode || !provisioningConfig.provisioningTeam || !provisioningConfig.token) {
                warn(`Credentials file '${deviceFile}' is not a valid provisioning file. Device cannot be provisioned`)
                return false
            }
            if (!provisioningConfig.forgeURL) {
                warn('Forge URL not specified. Device cannot be provisioned')
                return false
            }
            const deviceFileStat = await pathStat(deviceFile)
            if (deviceFileStat.exists && deviceFileStat.writable === false) {
                warn(`Credentials file '${deviceFile}' cannot be written. Device cannot be provisioned`)
                return false
            }
            return true // all pre-provisioning checks passed
        } catch (err) {
            debug(`Problem checking if device can be provisioned: ${err.toString()}`)
        }
        return false
    }

    // #region Private Methods
    async _getDeviceInfo (forgeURL) {
        const ifs = os.networkInterfaces()
        const ip2mac = {}
        const result = { host: os.hostname(), ip: null, mac: null }

        let firstMacNotInternal = null
        // eslint-disable-next-line no-unused-vars
        for (const [name, ifaces] of Object.entries(ifs)) {
            for (const iface of ifaces) {
                if (iface.family === 'IPv4' || iface.family === 'IPv6') {
                    ip2mac[iface.address] = iface.mac
                    if (!firstMacNotInternal && !iface.internal) {
                        firstMacNotInternal = iface.mac
                    }
                }
            }
        }

        if (forgeURL) {
            try {
                const forgeCheck = await got.get(forgeURL, {
                    headers: {
                        'user-agent': `FlowForge Device Agent v${this.configuration.version}`,
                        authorization: `Bearer ${this.configuration.token}`
                    },
                    timeout: {
                        request: 5000
                    }
                })
                result.ip = forgeCheck?.socket?.localAddress
                result.mac = ip2mac[result.ip] || result.ip
                result.mac = result.mac || firstMacNotInternal
            } catch (_error) {
                // ignore error
                console.log('Error getting device info from Forge', _error)
            }
        }
        return result
    }

    async _provisionDevice (device) {
        const credentials = device.credentials
        const forgeURL = device.forgeURL
        const deviceId = device.id
        const deviceJS = {
            deviceId,
            forgeURL,
            token: credentials.token,
            credentialSecret: credentials.credentialSecret,
            brokerURL: credentials.broker?.url,
            brokerUsername: credentials.broker?.username,
            brokerPassword: credentials.broker?.password,
            autoProvisioned: true
        }
        const deviceYAML = yaml.stringify(deviceJS)
        const deviceFile = this.options.deviceFile
        const backupFile = `${deviceFile}.bak`
        const backupFileStat = await pathStat(deviceFile)
        const skipBackup = backupFileStat.exists && backupFileStat.deletable !== true
        if (this.exiting) { return }
        if (skipBackup === false) {
            try {
                await fsExtra.rename(deviceFile, backupFile)
            } catch (error) {
                // ignore error but log it
                debug(`Error backing up device file: ${error.message}`)
            }
        }
        const deleteBackup = async () => {
            try {
                fsExtra.rmSync(backupFile, { force: true })
            } catch (error) {
                // ignore error but log it
                debug(`Error deleting backup file: ${error.message}`)
            }
        }
        try {
            const fn = await fsExtra.open(deviceFile, 'w') // open or create the file (with overwrite)
            await fsExtra.writeFile(fn, deviceYAML, { encoding: 'utf8' })
            await fsExtra.close(fn)
        } catch (error) {
            throw new Error(`Error writing device file '${deviceFile}'`, error)
        } finally {
            deleteBackup()
        }
    }
    // #endregion
}

/**
 * Get stats for a file or directory
 * @param {String} file - path to file or directory to stat
 * @returns {Object} - object with file/directory stats and error if any
 */
async function pathStat (file) {
    let fileExists, directoryExists, isFile, isDirectory, readable, writable, deletable, busy, error
    let state = 'unknown'
    try {
        state = 'stat'
        const resolved = path.resolve(file)
        const dirname = path.dirname(resolved)
        directoryExists = await fsExtra.pathExists(dirname)
        if (!directoryExists) {
            const err = new Error(`Directory '${dirname}' does not exist`)
            err.code = 'ENOENT'
            throw err
        }

        // assume for now `file` is a directory
        isDirectory = true
        isFile = false

        let stats
        try {
            stats = await fsExtra.stat(file)
        } catch (error) {
            fileExists = false
        }

        if (stats) {
            isDirectory = stats.isDirectory()
            isFile = stats.isFile()
            fileExists = isFile === true
        }

        if (isFile) {
            state = 'read'
            const f = await fsExtra.open(file, 'r')
            await fsExtra.close(f)
            busy = false
            readable = true
        }

        state = 'write'
        const w = await fsExtra.open(file, 'a')
        await fsExtra.close(w)
        writable = true
        if (writable && !fileExists) {
            state = 'delete'
            await fsExtra.rm(file, { force: true })
            deletable = true
        }
    } catch (err) {
        switch (err.code) {
        case 'ENOENT':
            fileExists = false
            break
        case 'EACCES':
        case 'EPERM':
            if (state === 'stat') {
                error = err
            }
            if (state === 'delete') {
                deletable = false
            } else if (state === 'write') {
                writable = false
            } else if (state === 'read') {
                readable = false
            }
            break
        case 'EISDIR':
            isFile = false
            break
        case 'EBUSY':
            busy = true
            break
        default:
            error = err
            break
        }
    }
    deletable = writable && !busy
    return { error, exists: fileExists, isFile, isDirectory, readable, writable, deletable, busy }
}

// create singleton
const agentManager = new AgentManager()

module.exports = { AgentManager: agentManager }
