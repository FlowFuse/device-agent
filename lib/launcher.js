const childProcess = require('child_process')
const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const { info, debug, warn, NRlog } = require('./logging/log')

const MIN_RESTART_TIME = 10000 // 10 seconds
const MAX_RESTART_COUNT = 5

const packageJSONTemplate = {
    name: 'flowforge-project',
    description: 'A FlowForge Project',
    private: true,
    version: '0.0.1',
    dependencies: {

    }
}

class Launcher {
    constructor (config, project, snapshot, settings, mode) {
        this.config = config
        this.project = project
        this.snapshot = snapshot
        this.settings = settings
        this.mode = mode
        this.restartCount = 0
        this.startTime = []
        this.state = 'stopped'

        this.projectDir = path.join(this.config.dir, 'project')

        this.files = {
            packageJSON: path.join(this.projectDir, 'package.json'),
            flows: path.join(this.projectDir, 'flows.json'),
            credentials: path.join(this.projectDir, 'flows_cred.json'),
            settings: path.join(this.projectDir, 'settings.js'),
            userSettings: path.join(this.projectDir, 'settings.json'),
            themeDir: path.join(this.projectDir, 'node_modules/@flowforge/nr-theme')
        }
    }

    async writePackage () {
        debug(`Updating package.json: ${this.files.packageJSON}`)
        const packageData = JSON.parse(JSON.stringify(packageJSONTemplate))
        packageData.dependencies = JSON.parse(JSON.stringify(this.snapshot.modules))
        packageData.version = `0.0.0-${this.snapshot.id}`
        packageData.name = this.snapshot.env.FF_PROJECT_NAME
        if (this.snapshot.name && this.snapshot.description) {
            packageData.description = `${this.snapshot.name} - ${this.snapshot.description}`
        }
        await fs.writeFile(this.files.packageJSON, JSON.stringify(packageData, ' ', 2))
        await fs.rm(path.join(this.projectDir, '.config.nodes.json'), { force: true })
        await fs.rm(path.join(this.projectDir, '.config.nodes.json.backup'), { force: true })
    }

    async readPackage () {
        debug(`Reading package.json: ${this.files.packageJSON}`)
        const data = {
            modules: {},
            version: '',
            name: '',
            description: ''
        }
        try {
            const packageJSON = await fs.readFile(this.files.packageJSON)
            const packageData = JSON.parse(packageJSON)
            data.modules = packageData.dependencies
            data.version = packageData.version
            data.name = packageData.name
            data.description = packageData.descriptions
        } catch (e) {
            console.error(e)
        }
        return data
    }

    async installDependencies () {
        info('Installing dependencies')
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
            return new Promise((resolve, reject) => {
                childProcess.exec('npm install --production', {
                    cwd: this.projectDir
                }, (error, stdout, stderr) => {
                    if (!error) {
                        resolve()
                    } else {
                        warn('Install failed')
                        warn(stderr)
                        reject(error)
                    }
                })
            })
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
            projectLink = {
                token: this.config.token,
                broker: {
                    url: this.config.brokerURL,
                    username: this.config.brokerUsername,
                    password: this.config.brokerPassword
                }
            }
        }

        const themeName = this.config.theme || 'forge-light'

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
                tours: false
            },
            flowforge: {
                forgeURL: this.config.forgeURL,
                projectID: this.project || undefined,
                teamID,
                projectLink
            }
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
        await fs.writeFile(this.files.userSettings, JSON.stringify(settings))
    }

    async writeConfiguration () {
        info('Updating configuration files')
        await fs.mkdir(this.projectDir, { recursive: true })
        await this.writePackage()
        await this.installDependencies()
        await this.writeFlow()
        await this.writeCredentials()
        await this.writeSettings()
    }

    async writeThemeFiles () {
        info('Updating theme files')
        const sourceDir = path.join(__dirname, '..', 'node_modules', '@flowforge', 'nr-theme')
        const targetDir = path.join(this.projectDir, 'node_modules', '@flowforge', 'nr-theme')
        try {
            if (!existsSync(sourceDir)) {
                info(`Could not write theme files. Theme not found: '${sourceDir}'`)
                return
            }
            if (!existsSync(targetDir)) {
                await fs.mkdir(targetDir, { recursive: true })
            }
            await fs.cp(sourceDir, targetDir, { recursive: true })
        } catch (error) {
            info(`Could not write theme files to disk: '${targetDir}'`)
        }
    }

    async start () {
        this.state = 'starting'
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

        if (!existsSync(this.files.themeDir)) {
            // As the theme may not present (due to earlier versions of the agent launcher),
            // we will independently write the theme files to the device project
            // (if the directory is not present)
            await this.writeThemeFiles()
        }

        const env = Object.assign({}, this.snapshot.env)
        if (this.settings?.env) {
            Object.assign(env, this.settings?.env)
        }

        info('Starting Node-RED')
        const appEnv = env
        const processArgs = [
            '-u',
            this.projectDir
        ]

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
            this.state = 'running'
        })

        this.proc.on('exit', async (code, signal) => {
            this.state = 'stopped'
            if (!this.shuttingDown) {
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
                        this.state = 'crashed'
                        restart = false
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

    async stop (clean) {
        info('Stopping Node-RED')
        // something wrong here, want to wait until child is dead
        if (this.proc) {
            this.shuttingDown = true
            const exitPromise = new Promise(resolve => {
                this.proc.on('exit', resolve)
            })
            this.proc.kill('SIGINT')
            await exitPromise
            info('Stopped Node-RED')
        }
        this.state = 'stopped'

        if (clean) {
            info('Cleaning instance directory')
            await fs.rm(this.projectDir, { force: true, recursive: true })
        }
    }
}

module.exports = {
    newLauncher: (config, project, snapshot, settings, mode) => new Launcher(config, project, snapshot, settings, mode),
    Launcher
}
