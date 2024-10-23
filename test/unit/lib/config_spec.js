const mocha = require('mocha') // eslint-disable-line
const should = require('should')
const sinon = require('sinon')
const { config, parseDeviceConfig, parseDeviceConfigFile } = require('../../../lib/config')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const yaml = require('yaml')

describe('config loader', () => {
    /** @type {sinon.SinonSandbox} */
    let sandbox
    let configFilePath
    let projectPath
    const deviceConfig = {
        forgeURL: 'https://forge.flowfuse.io',
        credentialSecret: 'secret',
        port: 1880,
        deviceId: 'DEVICEID',
        token: 'TOKEN',
        dir: '',
        verbose: true
    }
    function generateYaml (_config) {
        _config = Object.assign({}, deviceConfig, _config)
        return yaml.stringify(_config)
    }
    async function generateYamlFile (_config) {
        const ymlData = generateYaml(_config)
        await fs.writeFile(configFilePath, ymlData)
        return configFilePath
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        // shush the console
        sandbox.stub(console, 'log')
        deviceConfig.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-launcher-'))
        configFilePath = path.join(deviceConfig.dir, 'device.yml')
        projectPath = path.join(deviceConfig.dir, 'project')
        await fs.mkdir(projectPath)
        // since we will be loading the generated template+settings, we need to simlink the
        // node_modules to the project directory (so it can pick up ant requires in the settings.js file)
        await fs.symlink(path.join(__dirname, '..', '..', '..', 'node_modules'), path.join(projectPath, 'node_modules'), 'dir')
    })

    afterEach(async function () {
        sandbox.restore()
        try {
            await fs.rm(deviceConfig.dir, { recursive: true, force: true })
        } catch (_error) {
        }
    })

    describe('parseDeviceConfig', () => {
        it('should parse a valid device config', async function () {
            const ymlData = await generateYaml()
            const result = parseDeviceConfig(ymlData)
            should.exist(result)
            result.should.have.a.property('valid', true)
            result.should.have.a.property('deviceConfig').and.be.an.Object()

            const parsed = result.deviceConfig
            parsed.should.have.a.property('forgeURL', 'https://forge.flowfuse.io')
            parsed.should.have.a.property('forgeURL', 'https://forge.flowfuse.io')
            parsed.should.have.a.property('credentialSecret', 'secret')
            parsed.should.have.a.property('port', 1880)
            parsed.should.have.a.property('deviceId', 'DEVICEID')
            parsed.should.have.a.property('token', 'TOKEN')
            parsed.should.have.a.property('dir', deviceConfig.dir)
            parsed.should.have.a.property('verbose', true)
            parsed.should.not.have.a.property('httpNodeAuth')
        })
        describe('httpNodeAuth', () => {
            it('should parse config with httpNodeAuth set false', async function () {
                const extraSettings = {
                    httpNodeAuth: false
                }
                const ymlData = await generateYaml(extraSettings)
                const result = parseDeviceConfig(ymlData)
                should.exist(result)
                result.should.have.a.property('valid', true)
                result.should.have.a.property('deviceConfig').and.be.an.Object()

                const parsed = result.deviceConfig
                parsed.should.have.a.property('httpNodeAuth', false)
            })
            it('should parse config with valid httpNodeAuth settings', async function () {
                const extraSettings = {
                    httpNodeAuth: {
                        user: 'user',
                        pass: 'pass'
                    }
                }
                const ymlData = await generateYaml(extraSettings)
                const result = parseDeviceConfig(ymlData)
                should.exist(result)
                result.should.have.a.property('valid', true)
                result.should.have.a.property('deviceConfig').and.be.an.Object()

                const parsed = result.deviceConfig
                parsed.should.have.a.property('httpNodeAuth').and.be.an.Object()
                parsed.httpNodeAuth.should.have.a.property('user', 'user')
                parsed.httpNodeAuth.should.have.a.property('pass', 'pass')
            })
            it('should not validate invalid httpNodeAuth (string)', async function () {
                const extraSettings = {
                    httpNodeAuth: 'invalid'
                }
                const ymlData = await generateYaml(extraSettings)
                const parsed = parseDeviceConfig(ymlData)
                should.exist(parsed)
                parsed.should.have.a.property('valid', false)
                // parsed.should.have.a.property('message').and.match(/missing required options.httpNodeAuth\.user*/s)
                parsed.should.have.a.property('message').and.be.a.String()
                parsed.message.should.match(/missing required options.*httpNodeAuth\.user*/s)
            })
            it('should not validate invalid httpNodeAuth (missing pass)', async function () {
                const extraSettings = {
                    httpNodeAuth: {
                        user: 'user'
                    }
                }
                const ymlData = await generateYaml(extraSettings)
                const parsed = parseDeviceConfig(ymlData)
                should.exist(parsed)
                parsed.should.have.a.property('valid', false)
                parsed.should.have.a.property('message').and.be.a.String()
                parsed.message.should.match(/missing required options.*httpNodeAuth\.pass*/s)
            })
        })
    })

    describe('parseDeviceConfigFile', () => {
        it('should load and parse a valid device config file', async function () {
            await generateYamlFile()

            const result = parseDeviceConfigFile(configFilePath)
            should.exist(result)
            result.should.have.a.property('valid', true)
            result.should.have.a.property('deviceConfig').and.be.an.Object()

            const parsed = result.deviceConfig
            parsed.should.have.a.property('forgeURL', 'https://forge.flowfuse.io')
            parsed.should.have.a.property('credentialSecret', 'secret')
            parsed.should.have.a.property('port', 1880)
            parsed.should.have.a.property('deviceId', 'DEVICEID')
            parsed.should.have.a.property('token', 'TOKEN')
            parsed.should.have.a.property('dir', deviceConfig.dir)
            parsed.should.have.a.property('verbose', true)
            parsed.should.not.have.a.property('httpNodeAuth')
        })
    })

    describe('config', () => {
        it('should return a valid runtime config', async function () {
            await generateYamlFile()

            const options = {
                deviceFile: configFilePath,
                config: 'blah blah', // should get returned as is
                dummy: 'dummy' // extra options should get returned as is
            }

            const result = await config(options)
            should.exist(result)
            result.should.have.a.property('version').and.match(/^\d+\.\d+\.\d+$/)
            result.should.have.a.property('port', 1880)
            result.should.have.a.property('ui', false)
            result.should.have.a.property('uiHost')
            result.should.have.a.property('uiPort')
            result.should.have.a.property('provisioningMode', false)
            result.should.have.a.property('token', 'TOKEN')
            result.should.have.a.property('forgeURL', 'https://forge.flowfuse.io')
            result.should.have.a.property('deviceId', 'DEVICEID')
            result.should.have.a.property('credentialSecret', 'secret')
            result.should.have.a.property('dir', deviceConfig.dir)
            result.should.have.a.property('verbose', true)
            result.should.have.a.property('deviceFile', configFilePath)
            result.should.have.a.property('config', 'blah blah')
            result.should.have.a.property('dummy', 'dummy')
            // since this is a regular device yaml, it should not contain any provisioning extras
            result.should.not.have.a.property('provisioningExtras')
        })
        it('should return a valid provisioning config and any extras', async function () {
            const provisioningYaml = `
### PROVISIONING TOKEN ###
provisioningName: dt1
provisioningTeam: 12345ABCDE
provisioningToken: ffadp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
forgeURL: https://forge.flowfuse.io
httpStatic: /data
httpNodeAuth:
    user: user
    pass: $2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.
random: 123456
my_data:
    name: Alice
    address: "1234 Main St"
`
            await fs.writeFile(configFilePath, provisioningYaml)

            const options = {
                deviceFile: configFilePath
            }

            const result = await config(options)
            should.exist(result)
            result.should.have.a.property('version').and.match(/^\d+\.\d+\.\d+$/)
            result.should.have.a.property('port', 1880)
            result.should.have.a.property('ui', false)
            result.should.have.a.property('uiHost')
            result.should.have.a.property('uiPort')
            result.should.have.a.property('provisioningMode', true)
            result.should.not.have.a.property('cliSetup')
            result.should.have.a.property('token', 'ffadp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
            result.should.have.a.property('forgeURL', 'https://forge.flowfuse.io')
            result.should.have.a.property('deviceFile', configFilePath)

            result.should.have.a.property('provisioningExtras')
            // provisioningExtras is anything extra in the device yaml that is not part of the provisioning or device agent regular device yaml
            // e.g. a user may add extra settings like `httpStatic` or `httpNodeAuth` that should be carried over
            // So, it should not contain any of:
            //      'provisioningMode', 'provisioningName', 'provisioningTeam', 'provisioningToken',
            //      'token', 'forgeURL', 'deviceId', 'credentialSecret', 'deviceFile', 'brokerURL',
            //      'brokerUsername', 'brokerPassword', 'autoProvisioned', 'cliSetup'
            result.provisioningExtras.should.not.have.a.property('provisioningMode')
            result.provisioningExtras.should.not.have.a.property('provisioningName')
            result.provisioningExtras.should.not.have.a.property('provisioningTeam')
            result.provisioningExtras.should.not.have.a.property('provisioningToken')
            result.provisioningExtras.should.not.have.a.property('token')
            result.provisioningExtras.should.not.have.a.property('forgeURL')
            result.provisioningExtras.should.not.have.a.property('deviceId')
            result.provisioningExtras.should.not.have.a.property('credentialSecret')
            result.provisioningExtras.should.not.have.a.property('deviceFile')
            result.provisioningExtras.should.not.have.a.property('brokerURL')
            result.provisioningExtras.should.not.have.a.property('brokerUsername')
            result.provisioningExtras.should.not.have.a.property('brokerPassword')
            result.provisioningExtras.should.not.have.a.property('autoProvisioned')
            result.provisioningExtras.should.not.have.a.property('cliSetup')

            result.provisioningExtras.should.only.have.keys('httpStatic', 'httpNodeAuth', 'random', 'my_data')
            result.provisioningExtras.should.have.a.property('httpStatic', '/data')
            result.provisioningExtras.should.have.a.property('httpNodeAuth').and.be.an.Object()
            result.provisioningExtras.httpNodeAuth.should.have.a.property('user', 'user')
            result.provisioningExtras.httpNodeAuth.should.have.a.property('pass', '$2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.')
            result.provisioningExtras.should.have.a.property('random', 123456)
            result.provisioningExtras.should.have.a.property('my_data').and.be.an.Object()
            result.provisioningExtras.my_data.should.deepEqual({ name: 'Alice', address: '1234 Main St' })
        })
        it('should throw for missing config file', async function () {
            await generateYamlFile()

            const options = {
                deviceFile: configFilePath + '-i-do-not-exist'
            }
            should.throws(() => config(options), /ENOENT/)
        })
        it('should throw for bad config file', async function () {
            await generateYamlFile({ httpNodeAuth: true }) // true is not a valid httpNodeAuth

            const options = {
                deviceFile: configFilePath
            }
            should.throws(() => config(options), /missing required options/)
        })
    })
})
