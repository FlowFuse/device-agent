const childProcess = require('child_process')
const fs = require('fs/promises')
const path = require('path')

const packageJSONTemplate = {
    name: 'flowforge-project',
    description: 'A FlowForge Project',
    private: true,
    version: '0.0.1',
    dependencies: {

    }
}

class Launcher {
    constructor (config, project) {
        this.config = config
        this.project = project
        this.restartCount = 0
        this.startTimes = []
    }

    async writeNodes () {
        // const nodesFile = path.join(this.config.userDir, '.config.nodes.json')
        // const nodes = JSON.stringify(this.project.nodes)
        // await fs.writeFile(nodesFile, nodes)
        const packageJSON = JSON.parse(JSON.stringify(packageJSONTemplate))
        // const nodeRedVersion = this.project.modules['node-red']
        packageJSON.dependencies = JSON.parse(JSON.stringify(this.project.modules))
        // delete packageJSON.dependencies['node-red']
        const packageJSONPath = path.join(this.config.userDir, 'package.json')
        await fs.writeFile(packageJSONPath, JSON.stringify(packageJSON, ' ', 2))

        const promise = new Promise((resolve, reject) => {
            childProcess.exec('npm install --production', {
                cwd: this.config.userDir
            }, (error, stdout, stderr) => {
                if (!error) {
                    console.log(stdout)
                    resolve()
                } else {
                    reject(error)
                }
            })
        })

        return promise
    }

    async writeFlow () {
        const nodesFile = path.join(this.config.userDir, 'flows.json')
        const flows = JSON.stringify(this.project.flows)
        try {
            await fs.writeFile(nodesFile, flows)
        } catch (err) {
            console.log(err)
        }
    }

    async writeCredentials () {
        const nodesFile = path.join(this.config.userDir, 'flows_cred.json')
        if (this.project.credentials) {
            const credentials = JSON.stringify(this.project.credentials)
            await fs.writeFile(nodesFile, credentials)
        }
    }

    async writeSettings () {
        const templatePath = path.join(__dirname, '../template/settings.js')
        const userDirSettingsTemplate = path.join(this.config.userDir, 'settings.js')
        fs.copyFile(templatePath, userDirSettingsTemplate)

        const settings = {
            credentialSecret: this.config.credentialSecret,
            port: this.config.port
        }
        const userDirSettings = path.join(this.config.userDir, 'settings.json')
        fs.writeFile(userDirSettings, JSON.stringify(settings))
    }

    async start () {
        const appEnv = this.project.env
        const processArgs = [
            '-u',
            this.config.userDir
        ]

        const processOptions = {
            windowHide: true,
            env: appEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: this.config.userDir
        }

        const execPathJS = path.join(this.config.userDir, 'node_modules', 'node-red', 'red.js')
        const execPath = process.execPath
        processArgs.unshift(execPathJS)
        this.proc = childProcess.spawn(
            execPath,
            processArgs,
            processOptions
        )

        this.proc.on('spawn', () => {
            console.log('Started')
            this.startTimes.push(Date.now())
        })

        this.proc.on('exit', async (code, signal) => {
            console.log(`exitied with code ${code}`)
            console.log(this.shuttingDown)
            if (!this.shuttingDown) {
                if (this.restartCount < 5) {
                    this.restartCount++
                    this.start()
                }
            }
        })

        let stdoutBuffer = ''
        this.proc.stdout.on('data', (data) => {
            stdoutBuffer += data
            let linebreak = stdoutBuffer.indexOf('\n')
            while (linebreak > -1) {
                const line = stdoutBuffer.substring(0, linebreak)
                if (line.length > 0) {
                    console.log(line)
                }
                stdoutBuffer = stdoutBuffer.substring(linebreak + 1)
                linebreak = stdoutBuffer.indexOf('\n')
            }
        })
    }

    async stop () {
        console.log('shutting down')
        // something wrong here, want to wait until child is dead
        if (this.proc) {
            this.shuttingDown = true
            this.proc.kill('SIGINT')
        }
    }
}

module.exports = { Launcher }
