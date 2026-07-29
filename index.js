#!/usr/bin/env node
/* eslint-disable no-console */
const semver = require('semver')
if (semver.lt(process.version, '14.0.0')) {
    console.log('FlowFuse Device Agent requires at least NodeJS v14.x')
    process.exit(1)
}

const TESTING = process.env.NODE_ENV === 'test'

const path = require('path')
const fs = require('fs')
const os = require('os')
const childProcess = require('child_process')
const net = require('net')

const commandLineArgs = require('command-line-args')
const figures = require('@inquirer/figures').default
const confirm = require('@inquirer/confirm').default
const input = require('@inquirer/input').default
const select = require('@inquirer/select').default
const chalk = require('yoctocolors-cjs') // switch to the lighter yoctocolors-cjs to match @inquirer

const { info } = require('./lib/log')
const { hasProperty } = require('./lib/utils')
const { AgentManager } = require('./lib/AgentManager')
const { WebServer } = require('./frontend/server')
const ConfigLoader = require('./lib/config')
const flowImport = require('./lib/cli/flowsImporter').flowImport
const { OLD_PROJECT_FILE, PROJECT_FILE } = require('./lib/agent')

const webServer = new WebServer()

const defaultInquirerTheme = {
    prefix: '',
    style: {
        // Give some spacing to the messages
        message: (text, status) => { return '\n' + chalk.bold(text) + '\n' }
    }
}

async function main (testOptions) {
    const pkg = require('./package.json')

    // Parse command line args
    let options
    try {
        options = commandLineArgs(require('./lib/cli/args'), { camelCase: true })
        options = options._all
    } catch (err) {
        console.error(err)
        console.error('Run with -h for help')
        quit()
    }
    if (options.version) {
        console.error(pkg.version)
        quit()
    }
    if (options.help) {
        console.error(require('./lib/cli/usage').usage())
        quit()
    }

    // Configure silent mode
    let installerMode = false
    if (options.installerMode) {
        installerMode = true
    }

    // Locate the config directory
    if (options.dir === '') {
        // No dir has been explicitly set, so we need to set the default.
        // 1. Use `/opt/flowforge-device` if it exists
        // 2. Otherwise use `/opt/flowfuse-device`
        if (fs.existsSync('/opt/flowforge-device')) {
            options.dir = '/opt/flowforge-device'
        } else {
            options.dir = '/opt/flowfuse-device'
        }
    }

    if (!path.isAbsolute(options.dir)) {
        options.dir = path.join(process.cwd(), options.dir)
    }

    // Require dir to be created
    if (!fs.existsSync(options.dir)) {
        try {
            fs.mkdirSync(options.dir, { recursive: true })
            if (!fs.existsSync(options.dir)) {
                throw new Error('Failed to create dir')
            }
        } catch (err) {
            const quitMsg = `Cannot create directory '${options.dir}'.\nPlease ensure the parent directory is writable, or set a different path with -d`
            quit(quitMsg, 20) // Exit Code 20 - Invalid dir
            // REF: https://slg.ddnss.de/list-of-common-exit-codes-for-gnu-linux/
            return
        }
    } else {
        // Check we can write to the dir
        const testFile = path.join(options.dir, `.write-test-${process.pid}-${Date.now()}`)
        try {
            fs.writeFileSync(testFile, '')
            fs.unlinkSync(testFile)
            // DIR is writeable, continue
        } catch (err) {
            quit(`Cannot write to directory '${options.dir}'.\nPlease ensure the directory is writable, or set a different path with -d`, 21) // Exit Code 21 - Dir not writable
        }
    }

    // Locate the config file. Either the path exactly as specified,
    // or relative to dir

    let configFound = false
    const deviceFile1 = options.config || 'device.yaml'
    const deviceFile2 = path.join(options.dir, deviceFile1)
    if (fs.existsSync(deviceFile1)) {
        configFound = true
        options.deviceFile = deviceFile1
    } else if (fs.existsSync(deviceFile2)) {
        configFound = true
        options.deviceFile = deviceFile2
    }

    // If the config file is not found, set the `deviceFile` to the default value
    // ready for when the config file is created.
    if (!configFound) {
        options.deviceFile = deviceFile2 // deviceFile2 is the default value
    }

    // Validate the config file if it exists, and parse it into an object
    const parsedConfig = configFound && (ConfigLoader.parseDeviceConfigFile(options.deviceFile) || { valid: false })
    const isValidDeviceConfig = !!parsedConfig.valid

    // Now we can predict what port it will try to run NR on. Check if the port is available
    // and quit with message if not available.
    const desiredPort = options.port || parsedConfig?.deviceConfig?.port || 1880
    try {
        const portAvailable = await isPortAvailable(desiredPort, '127.0.0.1')
        if (!portAvailable) {
            let portMessage
            if (options.port) {
                // command-line specified port
                portMessage = `Port ${desiredPort} is not available. Use the --port option to select a different port to use.`
            } else if (parsedConfig?.deviceConfig?.port) {
                // device.yml specified port
                portMessage = `Port ${desiredPort} is not available. Update device.yml or use the --port option to select a different port to use.`
            } else {
                // default 1880
                portMessage = `Port ${desiredPort} is not available. Use the --port option to select a different port to use.`
            }
            quit(portMessage, 2)
            // In production quit() calls process.exit(); return here so test mode
            // (where quit() does not halt) also stops rather than falling through.
            return null
        }
    } catch (err) {
        // Error checking port availability; err on the side of caution and continue
    }

    delete options.config
    AgentManager.init(options)

    // CLI Option indicates this is a OTC setup run
    if (hasProperty(options, 'otc') || hasProperty(options, 'ffUrl')) {
        if (!options.otc || options.otc.length < 8) {
            // 8 is the minimum length of an OTC
            // e.g. ab-cd-ef
            console.log('Device setup requires parameter --otc to be 8 or more characters')
            quit(null, 2)
        }
        if (!options.ffUrl) {
            console.log('Device setup requires parameter --ff-url to be set')
            quit(null, 2)
        }
        logSetupStart()
        console.log()
        console.log(`Connecting to ${chalk.cyan(options.ffUrl)} with code ${chalk.cyan(options.otc)}`)
        handleOTCSetup(options)
    } else if (!isValidDeviceConfig && !options.ui && !options.noInteractive) {
        // No valid config found, and ui option not set - run the interactive setup flow
        handleInteractiveRegistration(options)
    } else {
        // Valid config found - start the agent normally
        await start(options, configFound)
        if (TESTING) {
            return {
                AgentManager,
                webServer,
                options: {
                    ...ConfigLoader.defaults,
                    ...options
                }
            }
        }
    }
    return null

    // ---- Only utility functions below this point ----

    /**
     * Start the DeviceAgent with the given options and configFound flag.
     * @param {*} options
     * @param {*} configFound
     */
    async function start (options, configFound) {
        info('FlowFuse Device Agent')
        info('----------------------')

        if (options.ui) {
            info('Starting Web UI')
            if (!options.uiUser || !options.uiPass) {
                quit('Web UI cannot run without a username and password. These are set via with --ui-user and --ui-pass', 2)
            }
            const uiRuntime = Number(options.uiRuntime)
            if (isNaN(uiRuntime) || uiRuntime === Infinity || uiRuntime < 0) {
                quit('Web UI runtime must be 0 or greater', 2)
            }
            const opts = {
                port: options.uiPort || 1879,
                host: options.uiHost || '0.0.0.0',
                credentials: {
                    username: options.uiUser,
                    password: options.uiPass
                },
                runtime: uiRuntime,
                dir: options.dir,
                config: options.config,
                deviceFile: options.deviceFile
            }
            webServer.initialize(AgentManager, opts)
            webServer.start().then().catch((err) => {
                info(`Web UI failed to start: ${err.message}`)
            })
        }

        process.on('SIGINT', closeAgentAndQuit)
        process.on('SIGTERM', closeAgentAndQuit)
        process.on('SIGQUIT', closeAgentAndQuit)

        // Revalidate the config file if it exists as an earlier step may have regenerated it
        const parsedConfig = configFound && (ConfigLoader.parseDeviceConfigFile(options.deviceFile) || { valid: false })
        const isValidDeviceConfig = !!parsedConfig.valid

        if (isValidDeviceConfig) {
            const desiredPort = options.port || parsedConfig.deviceConfig.port || 1880
            try {
                const portAvailable = await isPortAvailable(desiredPort, '127.0.0.1')
                if (!portAvailable) {
                    quit(`Port ${desiredPort} is not available. Update device.yml or use the --port option to select a different port to use.`, 2)
                }
            } catch (err) {
                // Error checking port availability; err on the side of caution and continue
            }

            AgentManager.startAgent()
        } else if (configFound && options.ui === true) {
            info(`Invalid config file '${options.deviceFile}'.`)
        } else if (!configFound && options.ui === true) {
            info(`No config file found at '${deviceFile1}' or '${deviceFile2}'`)
        } else {
            if (configFound) {
                quit(`Invalid config file '${options.deviceFile}': ${parsedConfig?.message || 'Unknown error'}'.`, 9) // Exit Code 9 - Invalid config file
            } else {
                quit(`No config file found at '${deviceFile1}' or '${deviceFile2}'`, 2) // No such file or directory
            }
        }
    }

    /**
     * Handle the interactive registration flow
     * @param {*} options
     * @returns
     */
    async function handleInteractiveRegistration (options) {
        try {
            // This handles the interactive registration flow with a platform.
            // This requires the platform URL to connect to.

            logSetupStart()

            // Steps:
            // 1. Ask for the platform URL
            let platformURL = await input({
                message: 'Enter the URL of your FlowFuse platform:',
                default: 'https://app.flowfuse.com',
                prefill: 'tab',
                required: true,
                validate: (input) => {
                    try {
                        // eslint-disable-next-line no-unused-vars
                        const url = new URL(input)
                        return true
                    } catch (err) {
                        return 'Please enter a valid URL (e.g. https://app.flowfuse.com)'
                    }
                },
                theme: defaultInquirerTheme
            }, { clearPromptOnDone: true })
            platformURL = platformURL.trim()
            if (!platformURL.endsWith('/')) {
                platformURL += '/'
            }
            console.log()
            console.log(`Connecting to ${chalk.cyan(platformURL)}`)

            // 2. Ask if they have an OTC (one-time code) or need to register
            const answer = await select({
                message: 'Are you registering a new instance or connecting with an existing One-Time Code (OTC)?',
                choices: [
                    {
                        name: 'Register as a new instance',
                        value: 'register'
                        // description: ''
                    },
                    {
                        name: 'Connect with an existing One-Time Code (OTC)',
                        value: 'otc'
                        // description: ''
                    }
                ],
                theme: defaultInquirerTheme
            }, { clearPromptOnDone: true })

            // 3. If they have an OTC, contiue with handleOTCSetup
            if (answer === 'otc') {
                const otc = await input({
                    message: 'Enter your One-Time Code (OTC):',
                    required: true,
                    theme: defaultInquirerTheme
                }, { clearPromptOnDone: true })
                options.otc = otc
                options.ffUrl = platformURL.replace(/\/$/, '') // remove trailing slash
                await handleOTCSetup(options)
            } else if (answer === 'register') {
                // 4. If they want to register, start the magic flow
                // New steps:
                // 1. HTTP POST to registration end point - get registerUrl and doneUrl
                const { default: got } = require('got')
                const client = got.extend({
                    // platformURL is already normalized to have a trailing slash
                    prefixUrl: platformURL
                })
                const registrationResponse = await client.post('api/v1/devices/_/register', {})
                const { registerUrl, doneUrl } = JSON.parse(registrationResponse.body)

                // 2. prompt user to open registerUrl (attempt to open ourselves)
                const fullRegisterUrl = platformURL + registerUrl.replace(/^\//, '')
                await confirm({
                    message: chalk.bold('To continue with registering your new instance, press ENTER to open your browser'),
                    theme: {
                        prefix: '',
                        style: {
                            // We don't want the Y/n as this is a simple press-enter-to-continue prompt
                            defaultAnswer: (text, status) => { return ' ' },
                            message: (text, status) => { return '\n' + text }
                        }
                    }
                }, { clearPromptOnDone: true })

                const browserOpened = await openBrowser(fullRegisterUrl)

                console.log()
                if (browserOpened) {
                    console.log('Your browser has been opened. If it has not, please copy and paste this URL into a browser to continue:')
                } else {
                    console.log('Please copy and paste this URL into a browser to continue:')
                }

                console.log()
                console.log(` ${chalk.bold(figures.triangleRightSmall)} ${chalk.cyan(fullRegisterUrl)}`)
                console.log()
                console.log(chalk.bold('Waiting for registration to complete...'))
                const ac = new AbortController()
                spinner(ac.signal)
                let result
                try {
                    result = await pollDoneUrl(client, doneUrl.replace(/^\//, ''), 5000, ac.signal)
                } catch (err) {
                    if (err.name === 'AbortError') {
                        // Polling was cancelled - nothing more to do here
                        return
                    }
                    throw err
                } finally {
                    // Stop the spinner whether we completed, cancelled or errored
                    ac.abort()
                }
                // If the user has been hitting enter, we don't want that to be in the stdin buffer when we prompt for the following steps
                await clearStdinBuffer()
                if (result && result.otc) {
                    options.otc = result.otc
                    options.ffUrl = platformURL.replace(/\/$/, '') // remove trailing slash
                    return handleOTCSetup(options)
                }
                console.log('Something went wrong with the device registration. The platform returned an unexpected response:')
                console.log(result)
                console.log('Please try again, or contact support if the problem persists.')
                quit('', 2)
            }
        } catch (err) {
            console.info()
            if (err instanceof Error && (err.name === 'HTTPError' || err.name === 'RequestError')) {
                // An error when establishing the registration session with the platform.
                // This could be:
                // 1. A network error
                // 2. An invalid platform URL
                // 3. An unexpected response from the platform
                quit(`Failed to connect to the platform. ${err.message}`, 2)
            } else if (err instanceof Error && err.name === 'ExitPromptError') {
                // User has hit ctrl-c or ctrl-d to exit the prompt. We don't need to log an error message in this case.
                quit('', 2)
            } else {
                quit(err.message, 2)
            }
        }
    }

    /**
     * Setup step - handle importing existing flows
     */
    async function handleFlowImport (options, deviceSettings) {
        // Support for importing flows during initial state check-in was added after 2.16.0.
        // Use semver.coerce to validate the ffVersion. This will, by default, strip off suffixes to ensure
        // a clean x.y.z comparison.
        const ffVersion = semver.coerce(deviceSettings.meta?.ffVersion || '0.0.0') // Strip suffixes like -beta.1
        const ffSupportsImport = (ffVersion && semver.gt(ffVersion, '2.16.0'))

        if (ffSupportsImport) {
            const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '/'
            const parentOfHome = path.dirname(home)
            const root = path.parse(parentOfHome).root
            const homeNodeRed = path.join(home, '.node-red')
            const rootNodeRed1 = path.join(root, 'node-red')
            const rootNodeRed2 = path.join(root, '.node-red')
            const rootNodeRed3 = path.join(root, 'nodered')
            const rootNodeRed4 = path.join(root, 'data') // common location for Node-RED data
            const suggestedDirs = [process.cwd(), homeNodeRed, rootNodeRed1, rootNodeRed2, rootNodeRed3, rootNodeRed4]

            try {
                // get an array of .node-red dirs in the home directories
                const parentDirNodeRedDirs = fs.readdirSync(parentOfHome, { withFileTypes: true })
                    .filter(dir => dir.isDirectory())
                    .map(dir => path.join(parentOfHome, dir.name, '.node-red'))
                    .filter(dir => fs.existsSync(dir) && fs.statSync(dir).isDirectory())
                suggestedDirs.push(...parentDirNodeRedDirs)
            } catch (_err) {
                // If we can't read the parent directory, just ignore it
            }
            // add common locations for FlowFuse Device Agent projects flows
            suggestedDirs.push(path.join('/opt/flowfuse-device/project'))
            suggestedDirs.push(path.join('/opt/flowforge-device/project'))
            // if provided, add the dir option as a suggested directory
            if (options.dir) {
                suggestedDirs.push(options.dir)
                suggestedDirs.push(path.join(options.dir, 'project'))
            }
            const absoluteSuggestedDirs = suggestedDirs.map(dir => path.resolve(dir)) // absolute paths
            const uniqueSuggestedDirs = [...new Set(absoluteSuggestedDirs)]
            const importOptions = await flowImport(uniqueSuggestedDirs)
            if (importOptions !== null) {
                const deviceConfig = {
                    flows: importOptions.flows || [],
                    credentials: importOptions.credentials || {},
                    package: importOptions.package || {}
                }
                console.info()
                const importResponse = await AgentManager.postState(
                    { token: deviceSettings.credentials.token, deviceId: deviceSettings.id, forgeURL: options.ffUrl },
                    {
                        provisioning: {
                            deviceConfig,
                            credentialSecret: importOptions.credentialSecret,
                            description: `Flows imported from '${importOptions.flowsFile}' at ${new Date().toISOString()}`,
                            name: 'Existing Flows Imported'
                        },
                        agentVersion: pkg.version,
                        state: 'provisioning'
                    }
                )
                if (importResponse.statusCode === 200) {
                    // The response doesn't contain any useful information to show the user - but it has worked
                    // at this point, flowImport has successfully created a snapshot on the platform - we can safely clean up the local files
                    // check to see if project dir exists & if so, clean it up
                    const projectDir = path.join(options.dir, 'project')
                    if (fs.existsSync(projectDir)) {
                        fs.rmSync(projectDir, { force: true, recursive: true })
                    }
                    let projectJson = path.join(options.dir, OLD_PROJECT_FILE)
                    if (fs.existsSync(projectJson)) {
                        fs.rmSync(projectJson, { force: true })
                    }
                    projectJson = path.join(options.dir, PROJECT_FILE)
                    if (fs.existsSync(projectJson)) {
                        fs.rmSync(projectJson, { force: true })
                    }
                    console.info('Flow import successful')
                } else {
                    console.info(`Flow import failed: ${importResponse.body}`)
                }
            }
        }
    }

    /**
     * Setup step - handle OTC setup
     */
    async function handleOTCSetup (options) {
        try {
            // Quick Connect mode
            // quickConnectDevice will throw if there are any issues
            const deviceSettings = await AgentManager.quickConnectDevice()
            const runCommandInfo = ['flowfuse-device-agent']
            if (options.dir !== '/opt/flowfuse-device') {
                runCommandInfo.push(`-d ${options.dir}`)
            }
            console.log()
            console.log(`Successfully registered as ${chalk.cyan(deviceSettings.name)} ${chalk.gray('(' + deviceSettings.id + ')')} in Team ${chalk.cyan(deviceSettings.team.name)}`)

            if (!options.otcNoImport) {
                // On some Windows terminals, a leftover console read from the previous prompt
                // can still be pending in the background and silently absorb the first keystroke
                // here (a known Windows/Node console quirk, not something we can fully prevent).
                // Arrow keys on the flow-import prompt below never satisfy that leftover read (no
                // line terminator), so it can look unresponsive; a plain ENTER always satisfies it.
                // This gate gives that one "wasted" keystroke somewhere safe to land.
                await confirm({
                    message: chalk.bold('Press ENTER to continue...'),
                    theme: {
                        prefix: '',
                        style: {
                            defaultAnswer: (text, status) => { return ' ' },
                            message: (text, status) => { return '\n' + text }
                        }
                    }
                }, { clearPromptOnDone: true })
                await clearStdinBuffer()
                await handleFlowImport(options, deviceSettings)
            }
            // If the user has set otcNoStart, then we don't want to start the agent
            console.info()

            if (!options.otcNoStart) {
                console.clear()
                console.log('Starting Device Agent with new configuration')
                delete options.otc
                delete options.ffUrl
                options.deviceFile = path.join(options.dir, 'device.yml')
                start(options, true)
            } else {
                if (!installerMode) {
                    console.log('The Device Agent can be launched at any time using the following command:')
                    console.log(`  ${chalk.bold(runCommandInfo.join(' '))}`)
                }
                console.info()
                quit()
            }
        } catch (err) {
            console.info()
            quit(err.message, 2)
        }
    }

    /**
     * Quit the process with an optional message and error code.
     * If in testing mode, it will call the onExit callback instead of exiting.
     * @param {*} msg
     * @param {*} errCode
     */
    function quit (msg, errCode = 0) {
        if (msg) { console.error(msg) }
        if (TESTING) {
            // don't exit if we are testing. Instead, call the onExit callback stub
            if (testOptions?.onExit) {
                testOptions.onExit(msg, errCode)
            }
        } else {
            process.exit(errCode)
        }
    }

    /**
     * Close the agent and quit with an optional message and error code.
     * @param {*} msg
     * @param {*} errCode
     */
    async function closeAgentAndQuit (msg, errCode = 0) {
        if (AgentManager) { await AgentManager.close() }
        quit(msg, errCode)
    }

    /**
     * Log the common setup start message to the console
     */
    async function logSetupStart () {
        console.clear()
        console.log(`${chalk.bold('Welcome to the')} ${chalk.cyan('FlowFuse Device Agent')} ${chalk.gray(`v${pkg.version}`)}`)
    }

    /**
     * Display an animated spinner in the terminal until the provided
     * AbortSignal fires, at which point the spinner is cleared. No-ops when
     * stdout is not a TTY.
     * @param {AbortSignal} signal - The signal to listen for to stop the spinner.
     */
    async function spinner (signal) {
        if (!process.stdout.isTTY) {
            return
        }
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        let index = 0

        // Hide the cursor while the spinner is running
        process.stdout.write('\x1B[?25l')

        const timer = setInterval(() => {
            process.stdout.write(frames[index])
            process.stdout.cursorTo(0)
            index = (index + 1) % frames.length
        }, 80)

        const stop = () => {
            clearInterval(timer)
            // Clear the spinner from the line and restore the cursor
            process.stdout.cursorTo(0)
            process.stdout.clearLine(1)
            process.stdout.write('\x1B[?25h')
        }

        if (signal.aborted) {
            stop()
            return
        }
        signal.addEventListener('abort', stop, { once: true })
    }

    /**
     * Poll the given doneUrl until we get a 200 response, or throw an error if we get a 404.
     * The polling will continue until the provided AbortSignal is aborted, at which point an AbortError will be thrown.
     * @param {*} client
     * @param {*} doneUrl
     * @param {*} interval
     * @param {*} signal
     * @returns
     */
    async function pollDoneUrl (client, doneUrl, interval = 5000, signal) {
        while (true) {
            // Throws an AbortError if the signal has been aborted, so the
            // caller can distinguish cancellation from a completed poll.
            signal?.throwIfAborted()
            try {
                const response = await client.get(doneUrl)
                if (response.statusCode === 200) {
                    return JSON.parse(response.body)
                } else if (response.statusCode === 404) {
                    throw new Error('Registration not found')
                }
            } catch (err) {
                if (err.response?.statusCode === 404) {
                    throw new Error('Registration not found')
                }
                // ignore errors and retry
            }
            // Wait for the interval, but wake early if the signal is aborted.
            // The throwIfAborted() at the top of the loop then handles the exit.
            await new Promise(resolve => {
                if (signal?.aborted) {
                    resolve()
                    return
                }
                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', onAbort)
                    resolve()
                }, interval)
                const onAbort = () => {
                    clearTimeout(timer)
                    resolve()
                }
                signal?.addEventListener('abort', onAbort, { once: true })
            })
        }
    }

    /**
     * Attempt to open the given URL in the user's default web browser in a
     * cross-platform way. Returns a boolean indicating whether we *think* the
     * browser was opened - this cannot be known for certain (for example when
     * running over an SSH/remote session there may be no browser to open).
     * @param {string} url - The URL to open in the browser.
     * @returns {Promise<boolean>} - Resolves to true if the browser was opened, false otherwise.
     */
    async function openBrowser (url) {
        const platform = os.platform()

        // On Linux there is no display to open a browser on when running
        // headless or over a remote session, so don't even try.
        if (platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
            return false
        }

        let command
        let args
        if (platform === 'darwin') {
            command = 'open'
            args = [url]
        } else if (platform === 'win32') {
            // Use cmd's `start` builtin. The empty '' is the window title
            // argument, required so a quoted URL isn't treated as the title.
            command = 'cmd'
            args = ['/c', 'start', '', url]
        } else {
            // Assume a freedesktop.org compatible platform (Linux, BSD, etc.)
            command = 'xdg-open'
            args = [url]
        }

        return new Promise((resolve) => {
            try {
                // Note: we intentionally do not detach/unref the child. The
                // launcher commands (open/start/xdg-open) hand off and exit
                // near-instantly, and we need to stay ref'd until the 'exit'
                // event so we can read the exit code. Unref-ing here lets the
                // event loop drain and the process exit mid-await.
                const child = childProcess.spawn(command, args, {
                    stdio: 'ignore'
                })
                child.on('error', () => resolve(false))
                // A non-zero exit code means the launcher command failed
                child.on('exit', (code) => resolve(code === 0))
            } catch (err) {
                resolve(false)
            }
        })
    }

    /**
     * Drain the stdin buffer to ensure that any leftover input (e.g. from pressing
     * enter during a previous prompt) does not interfere with subsequent prompts.
     */
    async function clearStdinBuffer () {
        return new Promise((resolve) => {
            // Only need to do this for TTY terminals
            if (!process.stdin.isTTY) {
                resolve()
                return
            }
            try {
                process.stdin.resume()
                while (process.stdin.read() !== null) {
                    // Consume from stdin until there's nothing left
                }
                // resume() leaves the stream flowing; pause it again so the next prompt
                // starts its own read from a clean, paused state.
                process.stdin.pause()
                // Pause a bit then resolve to continue
                setTimeout(resolve, 25)
            } catch {
                resolve()
            }
        })
    }

    /**
     * Checks if the port is open.
     * Returns a promise that resolves to true if the port is open, false if it is closed.
     * @param {number} port - The port to check.
     * @param {string} host - The host to check.
     * @returns {Promise<boolean>} - Resolves to true if the port is open, false if it is closed.
     */
    async function isPortAvailable (port, host) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket()
            function closeClient () {
                try {
                    if (client) {
                        client.removeAllListeners('connect')
                        client.removeAllListeners('error')
                        client.removeAllListeners('timeout')
                        client.end()
                        client.destroy()
                        client.unref()
                    }
                } catch (err) {
                    // ignore
                }
            }
            // Guard against the connection hanging (e.g. a firewalled port that
            // neither accepts nor refuses). A timeout is indeterminate, so treat
            // the port as available rather than blocking startup on a false positive.
            client.setTimeout(5000)
            client.once('timeout', () => {
                resolve(true)
                closeClient()
            })
            client.once('connect', () => {
                // Managed to connect a socket; the port is in use
                resolve(false)
                closeClient()
            })
            client.once('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    // Connection refused; the port is not in use
                    resolve(true)
                } else {
                    // Something when wrong - reject
                    reject(err)
                }
                closeClient()
            })
            client.connect({ port, host }, () => {})
        })
    }
}

// if we are testing, export the main function so we can call it directly, otherwise call it now
if (TESTING) {
    module.exports = { main }
} else {
    main()
}
