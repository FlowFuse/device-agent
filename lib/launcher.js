const childProcess = require('child_process')
const { existsSync } = require('fs')
const fs = require('fs/promises')
const path = require('path')
const { info, debug, warn } = require('./log')

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
    constructor (config, project, snapshot, settings) {
        this.config = config
        this.project = project
        this.snapshot = snapshot
        this.settings = settings
        this.restartCount = 0
        this.startTime = []
        this.state = 'stopped'

        this.projectDir = path.join(this.config.dir, 'project')

        this.files = {
            packageJSON: path.join(this.projectDir, 'package.json'),
            flows: path.join(this.projectDir, 'flows.json'),
            credentials: path.join(this.projectDir, 'flows_cred.json'),
            settings: path.join(this.projectDir, 'settings.js'),
            userSettings: path.join(this.projectDir, 'settings.json')
        }
    }

    async writePackage () {
        debug(`Updating package.json: ${this.files.packageJSON}`)
        const packageJSON = JSON.parse(JSON.stringify(packageJSONTemplate))
        packageJSON.dependencies = JSON.parse(JSON.stringify(this.snapshot.modules))
        await fs.writeFile(this.files.packageJSON, JSON.stringify(packageJSON, ' ', 2))
        await fs.rm(path.join(this.projectDir, '.config.nodes.json'), { force: true })
        await fs.rm(path.join(this.projectDir, '.config.nodes.json.backup'), { force: true })
    }

    async installDependencies () {
        info('Installing project dependencies')
        if (this.config.moduleCache) {
            return fs.symlink(path.join(this.config.dir, 'module_cache/node_modules'), path.join(this.projectDir, 'node_modules'), 'dir')
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

    async writeCredentials () {
        debug(`Updating credentials file: ${this.files.credentials}`)
        const credentials = JSON.stringify(this.snapshot.credentials || {})
        return fs.writeFile(this.files.credentials, credentials)
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
        const settings = {
            credentialSecret: this.config.credentialSecret,
            port: this.config.port,
            flowforge: {
                forgeURL: this.config.forgeURL,
                projectID: this.project || undefined,
                teamID,
                projectLink
            }
        }
        await fs.writeFile(this.files.userSettings, JSON.stringify(settings))
    }

    async writeConfiguration () {
        info('Updating project configuration files')
        await fs.mkdir(this.projectDir, { recursive: true })
        await this.writePackage()
        await this.installDependencies()
        await this.writeFlow()
        await this.writeCredentials()
        await this.writeSettings()
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

        const env = Object.assign({}, this.snapshot.env)
        if (this.settings?.env) {
            Object.assign(env, this.settings?.env)
        }

        info('Starting project')
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
                    console.log('[NR]', line)
                }
                stdoutBuffer = stdoutBuffer.substring(linebreak + 1)
                linebreak = stdoutBuffer.indexOf('\n')
            }
        }
        this.proc.stdout.on('data', handleLog)
        this.proc.stderr.on('data', handleLog)
    }

    async stop (clean) {
        info('Stopping project')
        // something wrong here, want to wait until child is dead
        if (this.proc) {
            this.shuttingDown = true
            const exitPromise = new Promise(resolve => {
                this.proc.on('exit', resolve)
            })
            this.proc.kill('SIGINT')
            await exitPromise
            info('Stopped project')
        }
        this.state = 'stopped'

        if (clean) {
            info('Cleaning project directory')
            await fs.rm(this.projectDir, { force: true, recursive: true })
        }
    }
}

module.exports = {
    Launcher: (config, project, snapshot, settings) => new Launcher(config, project, snapshot, settings)
}
