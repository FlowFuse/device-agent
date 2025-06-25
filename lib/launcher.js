const childProcess = require('child_process')
const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const { log, info, debug, warn, NRlog } = require('./logging/log')
const { hasProperty, getPackageData } = require('./utils')
const { States } = require('./states')
const { default: got } = require('got')

const MIN_RESTART_TIME = 10000 // 10 seconds
const MAX_RESTART_COUNT = 5

/** How long wait for Node-RED to cleanly stop before killing */
const NODE_RED_STOP_TIMEOUT = 10000

const packageJSONTemplate = {
    name: 'flowfuse-project',
    description: 'A FlowFuse Project',
    private: true,
    version: '0.0.1',
    dependencies: {

    }
}

class Launcher {
    constructor (agent, application, project, snapshot, settings, mode) {
        this.config = agent?.config
        this.application = application
        this.project = project
        this.snapshot = snapshot
        this.settings = settings
        this.mode = mode
        this.restartCount = 0
        this.startTime = []
        this.state = States.STOPPED
        this.stopReason = ''
        this.installProcess = null
        this.deferredStop = null
        /** @type {import('./agent.js').Agent */
        this.agent = agent

        this.auditLogURL = `${this.config.forgeURL}/logging/device/${this.config.deviceId}/audit`

        // A callback function that will be set if the launcher is waiting
        // for Node-RED to exit
        this.exitCallback = null

        this.projectDir = path.join(this.config.dir, 'project')

        this.files = {
            packageJSON: path.join(this.projectDir, 'package.json'),
            flows: path.join(this.projectDir, 'flows.json'),
            credentials: path.join(this.projectDir, 'flows_cred.json'),
            settings: path.join(this.projectDir, 'settings.js'),
            userSettings: path.join(this.projectDir, 'settings.json'),
            npmrc: path.join(this.projectDir, '.npmrc')
        }
    }

    async writePackage () {
        debug(`Updating package.json: ${this.files.packageJSON}`)
        const packageData = JSON.parse(JSON.stringify(packageJSONTemplate))
        packageData.dependencies = JSON.parse(JSON.stringify(this.snapshot.modules))
        // if we are working in a development env and the project nodes src is available in the right place,
        // then use the development version of the project nodes
        if (packageData.dependencies?.['@flowfuse/nr-project-nodes'] && process.env.NODE_ENV === 'development') {
            const devPath = path.join(__dirname, '..', '..', 'nr-project-nodes')
            if (existsSync(devPath)) {
                packageData.dependencies['@flowfuse/nr-project-nodes'] = `file:${devPath}`
            }
        }
        // if we are working in a development env and the assistant plugin src is available in the right place,
        // then use the development version of the assistant plugin
        if (packageData.dependencies?.['@flowfuse/nr-assistant'] && process.env.NODE_ENV === 'development') {
            const devPath = path.join(__dirname, '..', '..', 'nr-assistant')
            if (existsSync(devPath)) {
                packageData.dependencies['@flowfuse/nr-assistant'] = `file:${devPath}`
            }
        }
        // if (!packageData.dependencies['@flowfuse/nr-theme']) {
        //     // Ensure the theme package is in package.json so that its resources
        //     // don't get removed by npm.
        //     packageData.dependencies['@flowfuse/nr-theme'] = '*'
        // }
        packageData.version = `0.0.0-${this.snapshot.id}`
        packageData.name = this.snapshot.env.FF_PROJECT_NAME
        if (this.snapshot.name && this.snapshot.description) {
            packageData.description = `${this.snapshot.name} - ${this.snapshot.description}`
        }
        await fs.writeFile(this.files.packageJSON, JSON.stringify(packageData, ' ', 2))
        await fs.rm(path.join(this.projectDir, '.config.nodes.json'), { force: true })
        await fs.rm(path.join(this.projectDir, '.config.nodes.json.backup'), { force: true })
    }

    readPackage () {
        debug(`Reading package.json: ${this.files.packageJSON}`)
        try {
            return getPackageData(this.files.packageJSON)
        } catch (e) {
            console.error(e)
        }
        return {
            modules: {},
            version: '',
            name: '',
            description: ''
        }
    }

    async installDependencies () {
        info('Installing dependencies')
        this.state = States.UPDATING
        if (this.config.moduleCache) {
            info('Using module_cache')
            const sourceDir = path.join(this.config.dir, 'module_cache/node_modules')
            const targetDir = path.join(this.projectDir, 'node_modules')
            try {
                await fs.access(sourceDir)
            } catch (ee) {
                return Promise.reject(ee)
            }

            if (existsSync(targetDir)) {
                await fs.rm(targetDir, { force: true, recursive: true })
            }

            return fs.symlink(sourceDir, targetDir, 'dir')
        } else {
            this.installProcess = new Promise((resolve, reject) => {
                childProcess.exec('npm install --production', {
                    cwd: this.projectDir
                }, (error, stdout, stderr) => {
                    if (!error) {
                        resolve()
                        this.installProcess = null
                    } else {
                        warn('Install failed')
                        warn(stderr)
                        reject(error)
                        this.installProcess = null
                    }
                })
            })
            return this.installProcess
        }
    }

    async writeFlow () {
        debug(`Updating flows file: ${this.files.flows}`)
        const flows = JSON.stringify(this.snapshot.flows)
        return fs.writeFile(this.files.flows, flows)
    }

    async readFlow () {
        debug(`Reading flows file: ${this.files.flows}`)
        const flows = await fs.readFile(this.files.flows, 'utf8')
        return JSON.parse(flows)
    }

    async writeCredentials () {
        debug(`Updating credentials file: ${this.files.credentials}`)
        const credentials = JSON.stringify(this.snapshot.credentials || {})
        return fs.writeFile(this.files.credentials, credentials)
    }

    async readCredentials () {
        debug(`Reading credentials file: ${this.files.flows}`)
        const creds = await fs.readFile(this.files.credentials, 'utf8')
        return JSON.parse(creds)
    }

    async writeSettings () {
        debug(`Updating settings file: ${this.files.userSettings}`)
        const templatePath = path.join(__dirname, './template/template-settings.js')
        await fs.copyFile(templatePath, this.files.settings)

        let teamID
        let projectLink
        if (this.config.brokerUsername) {
            // Parse the teamID out of the brokerUsername
            teamID = this.config.brokerUsername.split(':')[1]
            // Determine if projectLink is enabled (default to true if not set in settings for backwards compatibility)
            const enabled = !!(this.settings?.features ? this.settings.features.projectComms : true)
            projectLink = {
                featureEnabled: enabled,
                // always include the token to permit project enumeration in the project nodes.
                // This permits the node to be usable/discoverable but no comms will
                // be possible due to the feature being disabled and the broker url/user/pass being empty.
                // The project nodes will inform the user of the need to enable or upgrade.
                token: this.config.token,
                broker: {
                    url: enabled ? this.config.brokerURL : '',
                    username: enabled ? this.config.brokerUsername : '',
                    password: enabled ? this.config.brokerPassword : ''
                },
                teamBrokerEnabled: enabled && !!this.settings?.features?.teamBroker
            }
        }

        const themeName = this.config.theme || 'forge-light'
        const assistant = {
            enabled: this.settings?.assistant?.enabled || false, // overall enable/disable
            url: `${this.config.forgeURL}/api/v1/assistant/`, // URL for the assistant service
            token: this.config.token,
            requestTimeout: this.settings?.assistant?.requestTimeout || 60000 // timeout for assistant requests
        }
        const settings = {
            credentialSecret: this.config.credentialSecret,
            port: this.config.port,
            codeEditor: this.settings?.codeEditor || 'monaco',
            [themeName]: { launcherVersion: this.config.version, forgeURL: this.config.forgeURL, projectURL: `${this.config.forgeURL}/device/${this.config.deviceId}/overview` },
            editorTheme: {
                theme: themeName,
                codeEditor: {
                    lib: this.settings?.codeEditor || this.config.codeEditor || 'monaco'
                },
                // library: TODO
                tours: false,
                palette: {}
            },
            flowforge: {
                forgeURL: this.config.forgeURL,
                projectID: this.project || undefined,
                applicationID: this.application || undefined,
                teamID,
                deviceId: this.config.deviceId,
                auditLogger: {
                    url: this.auditLogURL,
                    token: this.config.token,
                    bin: path.join(__dirname, 'auditLogger', 'index.js')
                },
                projectLink,
                assistant
            },
            nodesDir: [
                // This path exists when running the agent as a git clone
                path.resolve(path.join(__dirname, '..', 'node_modules', '@flowfuse', 'nr-theme')),
                // This path exists when running the agent as an npm installed package
                path.resolve(path.join(__dirname, '..', '..', 'nr-theme'))
            ]
        }

        // if licensed, add palette catalogues
        if (this.config.licensed) {
            if (this.project) {
                if (this.snapshot?.settings?.palette?.catalogue !== undefined) {
                    settings.editorTheme.palette.catalogues = this.snapshot.settings.palette.catalogue
                }
            } else if (this.application) {
                if (this.settings.palette?.catalogues) {
                    settings.editorTheme.palette.catalogues = this.settings.palette.catalogues
                }
            }
        }

        // if licensed, add shared library config
        const libraryEnabled = this.settings?.features ? this.settings.features['shared-library'] : false
        if (libraryEnabled && this.config.licensed) {
            settings.nodesDir = settings.nodesDir || []
            settings.nodesDir.push(path.join(__dirname, 'plugins', 'node_modules', '@flowfuse', 'flowfuse-library-plugin'))
            const sharedLibraryConfig = {
                id: 'flowfuse-team-library',
                type: 'flowfuse-team-library',
                label: 'Team Library',
                icon: 'font-awesome/fa-users',
                baseURL: this.config.forgeURL + '/storage', // Ideally, this would come from the model via API however it is currently just a virtual column of forgeURL + '/storage'
                projectID: settings.flowforge.projectID,
                applicationID: settings.flowforge.applicationID,
                libraryID: settings.flowforge.teamID,
                token: this.config.token
            }
            settings.editorTheme.library = {
                sources: [sharedLibraryConfig]
            }
        }
        if (this.config.licensed) {
            settings.nodesDir = settings.nodesDir || []
            settings.nodesDir.push(path.join(__dirname, 'plugins', 'node_modules', '@flowfuse', 'flowfuse-blueprint-plugin'))
            settings.editorTheme.library = settings.editorTheme.library || { sources: [] }
            settings.editorTheme.library.sources.push({
                id: 'flowfuse-blueprint-library',
                type: 'flowfuse-blueprint-library',
                label: 'Blueprints',
                icon: 'font-awesome/fa-map-o',
                types: ['flows'],
                readOnly: true,
                forgeURL: this.config.forgeURL,
                teamID: settings.flowforge.teamID,
                token: this.config.token
            })
        }
        if (this.config.https) {
            // The `https` config can contain any valid setting from the Node-RED
            // https object. For convenience, the `key`, `ca` and `cert` settings
            // have `*Path` equivalents that can be used to provide a path to load
            // the corresponding values from. The loading of the file contents
            // is done in settings.js - but we validate the files exist here to
            // ensure the config looks valid.
            const httpsErrors = []
            ;['keyPath', 'caPath', 'certPath'].forEach(key => {
                if (this.config.https[key]) {
                    if (!existsSync(this.config.https[key])) {
                        httpsErrors.push(`https.${key} file not found: ${this.config.https[key]}`)
                    }
                }
            })
            if (httpsErrors.length > 0) {
                warn('Invalid HTTPS configuration:')
                httpsErrors.forEach(err => warn(` - ${err}`))
                delete this.config.https
            } else {
                settings.https = this.config.https
            }
        }

        if (this.config.httpStatic) {
            // The `httpStatic` config is passed straight through to Node-RED
            settings.httpStatic = this.config.httpStatic
        }
        if (this.config.httpNodeAuth) {
            // The `httpNodeAuth` config is passed straight through to Node-RED
            // It is however sanitised in config.js to ensure it is an object
            // containing `user` and `pass` properties.
            settings.flowforge.httpNodeAuth = {
                type: 'basic',
                ...this.config.httpNodeAuth
            }
        } else if (this.settings?.security?.httpNodeAuth) {
            settings.flowforge.httpNodeAuth = {
                ...this.settings.security.httpNodeAuth,
                bin: path.join(__dirname, 'plugins/node_modules/@flowfuse/flowfuse-auth/httpAuthMiddleware.js')
            }
            if (settings.flowforge.httpNodeAuth.type === 'ff-user') {
                // Add the ff-auth plugin
                settings.nodesDir = settings.nodesDir || []
                settings.nodesDir.push(path.join(__dirname, 'plugins', 'node_modules', '@flowfuse', 'flowfuse-auth'))
            }
        }

        if (this.config.localAuth?.enabled) {
            settings.localAuth = {
                enabled: true,
                user: this.config.localAuth.user,
                pass: this.config.localAuth.pass
            }
        } else if (this.settings?.security?.localAuth?.enabled === true) {
            settings.localAuth = {
                enabled: true,
                user: this.settings.security.localAuth.user,
                pass: this.settings.security.localAuth.pass
            }
        } else {
            delete settings.flowforge.localAuth
        }

        await fs.writeFile(this.files.userSettings, JSON.stringify(settings))
    }

    /**
     * Write .npmrc file
     */
    async writeNPMRCFile () {
        if (this.project) {
            if (this.snapshot.settings?.palette?.npmrc) {
                await fs.writeFile(this.files.npmrc, this.snapshot.settings.palette.npmrc)
            } else {
                if (existsSync(this.files.npmrc)) {
                    await fs.rm(this.files.npmrc)
                }
            }
        } else if (this.application) {
            if (this.settings.palette?.npmrc) {
                await fs.writeFile(this.files.npmrc, this.settings.palette.npmrc)
            } else {
                if (existsSync(this.files.npmrc)) {
                    await fs.rm(this.files.npmrc)
                }
            }
        }
    }

    /**
     * Write the configuration files to disk
     * @param {Object} options Save options
     * @param {boolean} options.updateSnapshot Update the snapshot (flows, credentials, package.json)
     * @param {boolean} options.updateSettings Update the settings (settings.js, settings.json)
     */
    async writeConfiguration (options = { updateSnapshot: true, updateSettings: true }) {
        let fullWrite = !options // default to full write if no options are provided

        // If this is an application owned device, the NR version might be user defined.
        // When the updateSettings flag is set, the user defined version is specified
        // and the versions differ, set the fullWrite flag to cause the package.json
        // to be updated and the installDependencies function to be run.
        const userDefinedNRVersion = this.settings?.editor?.nodeRedVersion
        if (userDefinedNRVersion && options?.updateSettings && this.agent?.currentOwnerType === 'application') {
            const pkg = this.readPackage()
            const pkgNRVersion = pkg.modules?.['node-red'] || 'latest'
            const snapshotNRVersion = this.snapshot?.modules?.['node-red']
            if ((pkgNRVersion !== userDefinedNRVersion || snapshotNRVersion !== userDefinedNRVersion)) {
                // package.json dependencies will be updated with snapshot.modules when writePackage is called
                // so here, we need to update the snapshot modules node-red version with the user defined version
                this.snapshot.modules['node-red'] = userDefinedNRVersion
                fullWrite = true
            }
        }

        info('Updating configuration files')
        await fs.mkdir(this.projectDir, { recursive: true })
        if (fullWrite || options.updateSnapshot) {
            this.state = States.INSTALLING
            await this.writeNPMRCFile()
            await this.writePackage()
            await this.installDependencies()
            await this.writeFlow()
            await this.writeCredentials()
        }
        if (fullWrite || options.updateSettings === true) {
            await this.writeSettings()
            await this.writeNPMRCFile()
        }
    }

    async logAuditEvent (event, body) {
        const data = {
            timestamp: Date.now(),
            event
        }
        if (body && typeof body === 'object') {
            if (body.error) {
                data.error = {
                    code: body.error.code || 'unexpected_error',
                    error: body.error.error || body.error.message || 'Unexpected error'
                }
            } else {
                Object.assign(data, body)
            }
        }
        return got.post(this.auditLogURL, {
            json: data,
            headers: {
                authorization: 'Bearer ' + this.config.token
            }
        }).catch(_err => {
            console.error('Failed to log audit event', _err, event)
        })
    }

    async start () {
        if (this.deferredStop) {
            await this.deferredStop
        }

        this.state = States.STARTING
        if (!existsSync(this.projectDir) ||
            !existsSync(this.files.flows) ||
            !existsSync(this.files.credentials) ||
            !existsSync(this.files.settings) ||
            !existsSync(this.files.userSettings)
        ) {
            // If anything is missing - rewrite the whole project snapshot
            await this.writeConfiguration()
        } else {
            // All files exist - but it is possible that 'port' has changed
            // via CLI/config flag.
            // Rewrite the config file just to be sure
            await this.writeSettings()
        }

        const filterEnv = (env) =>
            Object.entries(env).reduce((acc, [key, value]) =>
                key.startsWith('FORGE') ? acc : { ...acc, [key]: value }, {})

        // According to https://github.com/flowforge/flowforge-nr-launcher/pull/145,
        // and in order to keep this feature coherent between launchers,
        // setting FORGE_EXPOSE_HOST_ENV on the container unlocks the host env propagation.
        const env = Object.assign({}, this.snapshot.env,
            process.env.FORGE_EXPOSE_HOST_ENV ? filterEnv(process.env) : {})
        if (this.settings?.env) {
            Object.assign(env, this.settings?.env)
        }

        // must always include the PATH so npm works
        env.PATH = process.env.PATH

        // pass through extra certs
        if (process.env.NODE_EXTRA_CA_CERTS) {
            env.NODE_EXTRA_CA_CERTS = process.env.NODE_EXTRA_CA_CERTS
        }

        // should set HOME env var
        if (process.platform === 'win32') {
            if (process.env.UserProfile && !env.UserProfile) {
                env.UserProfile = process.env.UserProfile
            }
        } else {
            if (process.env.HOME && !env.HOME) {
                env.HOME = process.env.HOME
            }
        }

        // Use local timezone if set, else use one from snapshot settings
        // this will be ignored on Windows as it does not use the TZ env var
        env.TZ = process.env.TZ ? process.env.TZ : this.settings?.settings?.timeZone

        // Add any proxy vars found in process.env. Note, this will override
        // any proxy settings provided by the devices settings.env
        const proxyVars = ['http_proxy', 'https_proxy', 'no_proxy', 'all_proxy']
        proxyVars.forEach(ev => {
            if (hasProperty(process.env, ev)) {
                env[ev] = process.env[ev]
            }
        })

        info('Starting Node-RED')
        this.state = States.STARTING // state may have been changed by stop() or deferredStop or Installing
        this.stopReason = ''
        const appEnv = env
        const processArgs = [
            '-u',
            this.projectDir
        ]

        // Additional include paths for node modules.
        // library, auth and other things loaded by node-red may require additional modules explicitly installed
        // by the device agent but not necessarily in the projects node_modules directory (e.g. the proxy agents)
        const nodePaths = []
        if (appEnv.NODE_PATH) {
            nodePaths.push(appEnv.NODE_PATH)
        }
        nodePaths.push(path.join(path.resolve(this.projectDir), 'node_modules'))
        nodePaths.push(path.join(__dirname, '..', 'node_modules'))
        appEnv.NODE_PATH = nodePaths.join(path.delimiter)

        const processOptions = {
            windowHide: true,
            env: appEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: this.projectDir
        }

        const execPathJS = path.join(this.projectDir, 'node_modules', 'node-red', 'red.js')
        const execPath = process.execPath
        processArgs.unshift(
            '--max_old_space_size=512',
            execPathJS
        )
        debug(`CMD: ${execPath} ${processArgs.join(' ')}`)
        /** @type {childProcess.ChildProcess} */
        this.proc = childProcess.spawn(
            execPath,
            processArgs,
            processOptions
        )

        this.proc.on('spawn', () => {
            this.startTime.push(Date.now())
            if (this.startTime.length > MAX_RESTART_COUNT) {
                this.startTime.shift()
            }
            this.state = States.RUNNING
        })

        this.proc.on('exit', async (code, signal) => {
            // determine if Node-RED exited for an expected reason
            // if yes, don't restart it since it was specifically stopped (e.g. not crashed)
            const expected = ['shutdown', States.RESTARTING, States.UPDATING, States.SUSPENDED].includes(this.stopReason)
            if (expected) {
                this.state = States.STOPPED // assume stopped
            } else {
                this.state = States.CRASHED // assume crashed
            }
            if (this.exitCallback) {
                this.exitCallback()
            }
            if (!expected) {
                let restart = true
                if (this.startTime.length === MAX_RESTART_COUNT) {
                    let avg = 0
                    for (let i = this.startTime.length - 1; i > 0; i--) {
                        avg += (this.startTime[i] - this.startTime[i - 1])
                    }
                    avg /= MAX_RESTART_COUNT
                    if (avg < MIN_RESTART_TIME) {
                        // restarting too fast
                        info('Node-RED restart loop detected - stopping')
                        this.state = States.CRASHED
                        restart = false
                        await this.logAuditEvent('crashed', { info: { code: 'loop_detected', info: 'Node-RED restart loop detected' } })
                        await this.agent?.checkIn()
                    }
                }
                if (restart) {
                    info('Node-RED stopped unexpectedly - restarting')
                    this.start()
                }
            }
        })

        let stdoutBuffer = ''
        const handleLog = (data) => {
            stdoutBuffer += data
            let linebreak = stdoutBuffer.indexOf('\n')
            while (linebreak > -1) {
                const line = stdoutBuffer.substring(0, linebreak)
                if (line.length > 0) {
                    // console.log('[NR]', line)
                    NRlog(line, '[NR]')
                }
                stdoutBuffer = stdoutBuffer.substring(linebreak + 1)
                linebreak = stdoutBuffer.indexOf('\n')
            }
        }
        this.proc.stdout.on('data', handleLog)
        this.proc.stderr.on('data', handleLog)
    }

    async stop (clean, reason) {
        if (this.installProcess && this.state === States.INSTALLING) {
            // If the launcher is currently installing, we should try not to interrupt this
            // to avoid corruption (NPM can leave temporary directories preventing future installs)
            // We should wait for the install to finish before stopping
            // give it a few seconds to finish
            const timeout = new Promise(resolve => setTimeout(resolve, 10000))
            await Promise.race([this.installProcess, timeout])
            // now proceed with stopping, regardless of whether the install finished
        }
        let finalState = States.STOPPED
        this.stopReason = reason || 'shutdown'
        info('Stopping Node-RED. Reason: ' + this.stopReason)
        if (this.stopReason === States.SUSPENDED) {
            finalState = States.SUSPENDED
        }
        if (this.deferredStop) {
            // A stop request is already inflight - return the existing deferred object
            return this.deferredStop
        }
        /** Operations that should be performed after the process has exited */
        const postShutdownOps = async () => {
            if (clean) {
                info('Cleaning instance directory')
                try {
                    await fs.rm(this.projectDir, { force: true, recursive: true })
                } catch (err) {
                    warn('Error cleaning instance directory', err)
                }
            }
            info('Node-RED Stopped')
            await this.agent?.checkIn() // let FF know we've stopped
        }

        if (this.proc && this.proc.exitCode === null) {
            // Setup a promise that will resolve once the process has really exited
            this.deferredStop = new Promise((resolve, reject) => {
                // Setup a timeout so we can more forcefully kill Node-RED
                this.exitTimeout = setTimeout(async () => {
                    log('Node-RED stop timed-out. Sending SIGKILL', 'system')
                    if (this.proc) {
                        this.proc.kill('SIGKILL')
                    }
                }, NODE_RED_STOP_TIMEOUT)
                // Setup a callback for when the process has actually exited
                this.exitCallback = async () => {
                    clearTimeout(this.exitTimeout)
                    this.exitCallback = null
                    this.deferredStop = null
                    this.exitTimeout = null
                    this.proc && this.proc.unref()
                    this.proc = undefined
                    await postShutdownOps()
                    resolve()
                }
                // Send a kill signal. On Linux this will be a SIGTERM and
                // allow Node-RED to shutdown cleanly. Windows looks like it does
                // it more forcefully by default.
                this.proc.kill()
                this.state = finalState
            })
            return this.deferredStop
        } else {
            this.proc && this.proc.unref()
            this.proc = undefined
            this.state = finalState
            await postShutdownOps()
        }
    }
}

module.exports = {
    newLauncher: (agent, application, project, snapshot, settings, mode) => new Launcher(agent, application, project, snapshot, settings, mode),
    Launcher
}
