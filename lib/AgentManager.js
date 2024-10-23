// AgentManager: A class that manages the device agent.
// It can start/stop and reload the agent

const { initLogger, info, warn, debug } = require('./logging/log')
const { default: GOT } = require('got/dist/source')
const agent = require('./agent')
const os = require('os')
const fs = require('fs')
const path = require('path')
const yaml = require('yaml')
const { getHTTPProxyAgent } = require('./utils.js')

class AgentManager {
    static options = null
    constructor () {
        if (AgentManager.options) {
            throw new Error('Agent Manager already instantiated')
        }
        this.init({})
        /** @type {import('./agent.js').Agent} */
        this.agent = null
        /** Device configuration processed from device yaml and options */
        this.configuration = null
        /** The original device yaml data as JS object */
        this.provisioningExtras = null
    }

    init = (options) => {
        options.version = options.version || require('../package.json').version
        AgentManager.options = options
        this._state = 'unknown'
        this.agent = null
        this.configuration = null
        this.provisioningExtras = null
        this.client = GOT.extend({})
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
        if (this._state === 'exiting') { return } // don't update state once set to exiting
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
        const config = require('./config').config(this.options)
        // separate out the provisioningExtras object. everything else goes into configuration
        const { provisioningExtras, ...configuration } = config
        this.configuration = configuration
        this.provisioningExtras = provisioningExtras
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
            await this.reloadConfig()
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
    reloadAgent (delay = 500, callback) {
        if (this.exiting) { return }
        this.state = 'reloading'
        // ensure delay is 20ms or more (default 500ms)
        delay = Math.max(20, delay || 500)
        this.cancelReload()
        // on next tick, stop the agent, wait, then start it again
        process.nextTick(async () => {
            try {
                await this.stopAgent()
                if (this.exiting) { return }
                this.reloadTimer = setTimeout(async () => {
                    if (this.exiting) { return }
                    this.state = await this.startAgent() || 'started'
                    if (callback) {
                        callback(null, this.state)
                    }
                }, delay)
            } catch (error) {
                if (callback) {
                    callback(error, this.state)
                }
            }
        }, delay)
    }

    cancelReload () {
        this.reloadTimer && clearTimeout(this.reloadTimer)
    }

    async provisionDevice (provisioningURL, provisioningTeam, provisioningToken) {
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
        let provisioningOK = false
        let postResponse = null

        try {
            // before we do anything, check if the device can be provisioned
            // These checks will ensure files are writable and the necessary settings are present
            if (await this.canBeProvisioned(provisioningConfig) !== true) {
                throw new Error('Device cannot be provisioned. Check the logs for more information.')
            }

            // Get the local IP address / MAC / Hostname of the device for use in naming
            const { host, ip, mac, forgeOk } = await this._getDeviceInfo(provisioningConfig.forgeURL, this.configuration?.token)
            if (!forgeOk) {
                throw new Error('Unable to connect to the Forge Platform')
            }
            const type = 'Auto Provisioned' + (provisioningConfig.provisioningName ? ` [${provisioningConfig.provisioningName}]` : '')
            const team = provisioningConfig.provisioningTeam
            const name = ((host || ip) + (mac ? ` (${mac})` : '')) || 'New Device'

            // Provision this device in the forge platform and receive the device ID, credentials and other details
            postResponse = await this.client.post(`${provisioningConfig.forgeURL}/api/v1/devices`, {
                headers: {
                    'user-agent': `FlowFuse Device Agent v${this.configuration?.version || ' unknown'}`,
                    authorization: `Bearer ${provisioningConfig.token}`
                },
                timeout: {
                    request: 10000
                },
                json: { name, type, team },
                agent: getHTTPProxyAgent(provisioningConfig.forgeURL, { timeout: 10000 })
            })

            if (postResponse?.statusCode !== 200) {
                throw new Error(`${postResponse.statusMessage} (${postResponse.statusCode})`)
            }
            provisioningOK = true
        } catch (err) {
            warn(`Problem encountered during provisioning: ${err.toString()}`)
            provisioningOK = false
        }

        if (!provisioningOK) {
            // try again in 10 minutes
            // * the device.yml file may have been fixed or updated
            // * the server may be back online
            info('Provisioning failed. Retrying in 10 minutes.')
            this.reloadAgent(10 * 60 * 1000)
            return false
        }

        try {
            // * At this point, the device is created. We need to update  the config, and restart the
            //   agent. If a problem occurs generating the device.yml, we need to end the program to
            //   avoid generating multiple devices on the platform
            // * FUTURE: If generating the device.yml fails we should probably delete the device we
            //   just created. For now, we use the `canBeProvisioned()` check up front to avoid this problem
            const provisioningData = JSON.parse(postResponse.body)
            provisioningData.forgeURL = provisioningData.forgeURL || provisioningConfig.forgeURL
            await this._provisionDevice(provisioningData)
            this.reloadAgent(5000) // success - reload the device.yml
            return true
        } catch (err) {
            warn(`Error provisioning device: ${err.toString()}`)
            throw err
        }
    }

    async quickConnectDevice () {
        debug('Setting up device')

        // sanity check the parameters
        const provisioningConfig = {
            quickConnectMode: true,
            forgeURL: this.options.ffUrl,
            token: Buffer.from(this.options.otc).toString('base64')
        }
        let success = false
        let postResponse = null

        const url = new URL('/api/v1/devices/', provisioningConfig.forgeURL)
        try {
            // before we do anything, check if the device can be provisioned
            // These checks will ensure files are writable and the necessary settings are present
            if (await this.canBeProvisioned(provisioningConfig) !== true) {
                throw new Error('Device cannot be provisioned. Check the logs for more information.')
            }

            // Get the local IP address / MAC / Hostname of the device to generate a value for the agentHost field
            const anEndpoint = new URL('/api/v1/settings/', provisioningConfig.forgeURL)
            const { host, ip, forgeOk } = await this._getDeviceInfo(anEndpoint)
            if (!forgeOk) {
                throw new Error('Unable to connect to the FlowFuse Platform')
            }

            // Instruct platform to re-generate credentials for this device, passing in the agentHost field and the quickConnect flag
            // NOTE: the OTC is passed in the Authorization header
            // NOTE: the OTC token is 100% single use. The platform deletes it upon use regardless of the device-agent successfully writing the config file
            postResponse = await this.client.post(url, {
                headers: {
                    'user-agent': `FlowFuse Device Agent v${this.configuration?.version || ' unknown'}`,
                    authorization: `Bearer ${provisioningConfig.token}`
                },
                timeout: {
                    request: 10000
                },
                json: { setup: true, agentHost: host || ip },
                agent: getHTTPProxyAgent(provisioningConfig.forgeURL, { timeout: 10000 })
            })

            if (postResponse?.statusCode !== 200) {
                throw new Error(`${postResponse.statusMessage} (${postResponse.statusCode})`)
            }
            success = true
        } catch (err) {
            warn(`Problem encountered during provisioning: ${err.toString()}`)
            success = false
        }

        if (!success) {
            return false
        }

        try {
            // * At this point, the one-time-code is spent (deleted) and we have all the info we need to update the config
            const provisioningData = JSON.parse(postResponse.body)
            provisioningData.forgeURL = provisioningData.forgeURL || provisioningConfig.forgeURL
            await this._provisionDevice(provisioningData)
            return true
        } catch (err) {
            warn(`Error provisioning device: ${err.toString()}`)
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
            if (!provisioningConfig) {
                warn('Provisioning config not specified. Device cannot be provisioned')
                return false
            }
            // Using One-Time-code or provisioning token?
            if (provisioningConfig.quickConnectMode) { // OTC mode
                if (!this.options.otc) {
                    warn('One time code not specified. Device cannot be setup')
                    return false
                }
                if (!this.options.ffUrl) {
                    warn('FlowFuse URL not specified. Device cannot be setup')
                    return false
                }
            } else { // provisioning token mode
                if (!provisioningConfig.provisioningMode || !provisioningConfig.provisioningTeam || !provisioningConfig.token) {
                    warn(`Credentials file '${deviceFile}' is not a valid provisioning file. Device cannot be provisioned`)
                    return false
                }
            }
            if (!provisioningConfig.forgeURL) {
                warn('FlowFuse URL not specified. Device cannot be provisioned')
                return false
            }
            const deviceFileStat = pathStat(deviceFile)
            if (deviceFileStat.fileExists && deviceFileStat.writable === false) {
                warn(`Credentials file '${deviceFile}' cannot be written. Device cannot be provisioned`)
                return false
            } else if (deviceFileStat.parentDirectoryExists === false || deviceFileStat.parentDirectoryWritable === false) {
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
    async _getDeviceInfo (forgeURL, token) {
        const ip2mac = {}
        const result = { host: os.hostname(), ip: null, mac: null, forgeOk: false }
        try {
            const ifs = os.networkInterfaces()
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
                let forgeCheck
                const headers = {
                    'user-agent': `FlowFuse Device Agent v${this.options?.version || ' unknown'}`
                }
                if (token) {
                    headers.authorization = `Bearer ${token}`
                }
                try {
                    forgeCheck = await this.client.get(forgeURL, {
                        headers,
                        timeout: {
                            request: 5000
                        },
                        agent: getHTTPProxyAgent(forgeURL, { timeout: 5000 })
                    })
                    result.ip = forgeCheck?.socket?.localAddress
                    result.mac = ip2mac[result.ip] || result.ip
                    result.mac = result.mac || firstMacNotInternal
                } catch (_error) {
                    result._error = _error
                    forgeCheck = _error.response
                }
                if (token) {
                    result.forgeOk = [200, 204].includes(forgeCheck?.statusCode)
                } else {
                    result.forgeOk = [200, 204, 401, 403, 404].includes(forgeCheck?.statusCode) // got _a_ response from the server, good enough for an existence check
                }
            }
        } catch (err) {
            // non fatal error, ignore and return what we have
        }
        return result
    }

    async _provisionDevice (platformProvisioningData) {
        const credentials = platformProvisioningData.credentials
        const forgeURL = platformProvisioningData.forgeURL
        const deviceId = platformProvisioningData.id
        const deviceJSPriority = {
            deviceId,
            forgeURL,
            token: credentials.token,
            credentialSecret: credentials.credentialSecret,
            brokerURL: credentials.broker?.url,
            brokerUsername: credentials.broker?.username,
            brokerPassword: credentials.broker?.password,
            autoProvisioned: true
        }

        // Generate deviceJs from ...this.provisioningExtras (extra config from the provisioning yaml) and the priority deviceJs
        const deviceJS = { ...this.provisioningExtras, ...deviceJSPriority }

        if (this.options?.otc) {
            // when _provisionDevice is called, it was either cli-setup or auto-provisioned
            // not both! delete the other flag
            deviceJS.cliSetup = true
            delete deviceJS.autoProvisioned
        }
        const deviceYAML = yaml.stringify(deviceJS)
        const deviceFile = this.options.deviceFile
        const backupFile = `${deviceFile}.bak`
        const backupFileStat = pathStat(backupFile)
        const skipBackup = backupFileStat.fileExists && backupFileStat.deletable !== true

        // helper fn to delete a file without throwing errors
        const deleteFile = (filename) => {
            try {
                fs.rmSync(filename)
            } catch (error) {
                // ignore error but log it
                debug(`Error deleting file '${filename}': ${error.message}`)
            }
        }

        // last chance to exit before rewriting the device file
        if (this.exiting) { return }
        if (skipBackup === false) {
            if (backupFileStat.fileExists) {
                deleteFile(backupFile) // quietly delete the backup file
                backupFileStat.fileExists = false
            }
            try {
                // move the current device file to a backup file
                fs.renameSync(deviceFile, backupFile)
                backupFileStat.fileExists = true
            } catch (error) {
                // ignore error but log it
                debug(`Error backing up file '${deviceFile}': ${error.message}`)
            }
        }

        try {
            // 'w' flag definition: https://nodejs.org/docs/latest-v16.x/api/fs.html#file-system-flags
            // Open the file for writing. The file is created
            // (if it does not exist) or truncated (if it exists).
            const fn = fs.openSync(deviceFile, 'w')
            fs.writeFileSync(fn, deviceYAML, { encoding: 'utf8' })
            fs.closeSync(fn)
        } catch (error) {
            throw new Error(`Error writing device file '${deviceFile}'`, error)
        } finally {
            if (backupFileStat.fileExists) {
                deleteFile(backupFile) // quietly delete the backup file
            }
        }
    }
    // #endregion
}

/**
 * Get stats for a file or directory
 * @param {String} _path - path to file or directory to stat
 * @returns {Object} - object with file/directory stats and error if any
 */
function pathStat (_path) {
    let parentDirectory, fileExists, parentDirectoryExists, isFile, isDirectory, readable, writable, deletable, busy, error
    let state = 'unknown'
    try {
        state = 'stat'
        const resolved = path.resolve(_path)
        parentDirectory = path.dirname(resolved)
        parentDirectoryExists = fs.existsSync(parentDirectory)
        if (!parentDirectoryExists) {
            const err = new Error(`Directory '${parentDirectory}' does not exist`)
            err.code = 'ENOENT'
            throw err
        }

        isDirectory = false
        isFile = false

        let stats
        try {
            stats = fs.statSync(_path)
        } catch (error) {
            fileExists = false
        }

        if (stats) {
            isDirectory = stats.isDirectory()
            isFile = stats.isFile()
            fileExists = isFile === true
        }
        if (isDirectory || fileExists) {
            // check access to directory
            state = 'read'
            fs.accessSync(_path, fs.constants.R_OK)
            readable = true
            state = 'write'
            fs.accessSync(_path, fs.constants.W_OK)
            writable = true
            busy = false
        } else {
            // file does not exist, check if we can create it
            state = 'write'
            const rw = fs.openSync(_path, 'a+') // Open file for reading and appending. The file is created if it does not exist.
            fs.closeSync(rw)
            readable = true
            writable = true
            // at this point, calls to fs.open 'a+' should have created the file
            if (fs.existsSync(_path)) {
                state = 'delete'
                fs.rmSync(_path)
                deletable = true
            } else {
                writable = false
                deletable = false
            }
        }
    } catch (err) {
        error = err
        switch (err.code) {
        case 'ENOENT':
            fileExists = false
            if (state === 'write') {
                // an error at this point normally means bad file name
                // either way, we can't write to the file
                writable = false
            }
            break
        case 'EACCES':
        case 'EPERM':
            if (state === 'stat') {
                error = err
            } else if (state === 'delete') {
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
        }
    }
    deletable = writable && !busy
    return { error, parentDirectory, parentDirectoryExists, isFile, fileExists, isDirectory, readable, writable, deletable, busy }
}

// create singleton
const agentManager = new AgentManager()

module.exports = { AgentManager: agentManager }
