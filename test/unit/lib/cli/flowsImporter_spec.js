const mocha = require('mocha') // eslint-disable-line
const should = require('should')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const utils = require('../../../../lib/utils')
const Select = require('@inquirer/select')
const Input = require('@inquirer/input')
const Confirm = require('@inquirer/confirm')

/** @type {import('../../../../lib/cli/flowsImporter')} */
let flowsImporter

describe('Flows Importer', function () {
    let sandbox
    let tempDir
    let testFlowsDir
    let mockFlowsFile
    let mockCredsFile
    let mockPackageFile

    const mockFlows = [
        { id: 'node1', type: 'tab', label: 'Flow 1' },
        { id: 'node2', type: 'inject', name: 'Inject node' }
    ]

    const mockCredentials = {
        node2: {
            user: 'encryptedcreds'
        }
    }

    const mockPackageData = {
        name: 'test-flows',
        dependencies: {
            'node-red': '^4.0.9',
            'node-red-contrib-test': '^1.0.0'
        }
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-flows-importer-'))
        testFlowsDir = path.join(tempDir, 'node-red')
        await fs.mkdir(testFlowsDir, { recursive: true })

        // Create mock files
        mockFlowsFile = path.join(testFlowsDir, 'flows.json')
        mockCredsFile = path.join(testFlowsDir, 'flows_cred.json')
        mockPackageFile = path.join(testFlowsDir, 'package.json')

        await fs.writeFile(mockFlowsFile, JSON.stringify(mockFlows))
        await fs.writeFile(mockCredsFile, JSON.stringify(mockCredentials))
        await fs.writeFile(mockPackageFile, JSON.stringify(mockPackageData))

        // Stub inquirer components
        sandbox.stub(Select, 'default')
        sandbox.stub(Input, 'default')
        sandbox.stub(Confirm, 'default')

        // now the stubs are set we can require the flowsImporter module
        // but first, clear the require cache to ensure we get a fresh instance
        delete require.cache[require.resolve('../../../../lib/cli/flowsImporter')]
        flowsImporter = require('../../../../lib/cli/flowsImporter')

        // Stub console.info to prevent output during tests
        sandbox.stub(console, 'info')
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    describe('getFlowsFileDetails', function () {
        it('should identify a valid Node-RED flows file', async function () {
            const result = await flowsImporter.getFlowsFileDetails(testFlowsDir, 'flows.json')

            result.should.have.property('isFlowsFile', true)
            result.should.have.property('name', 'flows.json')
            result.should.have.property('flowsFile', mockFlowsFile)
            result.should.have.property('credsFile', mockCredsFile)
            result.should.have.property('flows').and.be.an.Array()
        })

        it('should reject an invalid JSON file', async function () {
            const invalidFile = path.join(testFlowsDir, 'invalid.json')
            await fs.writeFile(invalidFile, 'not valid json')

            const result = await flowsImporter.getFlowsFileDetails(testFlowsDir, 'invalid.json')
            result.should.have.property('isFlowsFile', false)
        })

        it('should reject a JSON file that is not a Node-RED flows file', async function () {
            const nonFlowsFile = path.join(testFlowsDir, 'not-flows.json')
            await fs.writeFile(nonFlowsFile, JSON.stringify({ something: 'else' }))

            const result = await flowsImporter.getFlowsFileDetails(testFlowsDir, 'not-flows.json')
            result.should.have.property('isFlowsFile', false)
        })
    })

    describe('getFlowFiles', function () {
        it('should find Node-RED flows files in a directory', async function () {
            // Create additional flows file
            const additionalFlows = path.join(testFlowsDir, 'flows-backup.json')
            await fs.writeFile(additionalFlows, JSON.stringify(mockFlows))

            const result = await flowsImporter.getFlowFiles(testFlowsDir)

            result.should.be.an.Array()
            result.should.have.length(2)
            result[0].should.have.property('isFlowsFile', true)
            result[1].should.have.property('isFlowsFile', true)
        })

        it('should ignore files that are not flows files', async function () {
            // Create non-flows files
            await fs.writeFile(path.join(testFlowsDir, '.config.json'), '{}')
            await fs.writeFile(path.join(testFlowsDir, 'something_cred.json'), '{}')

            const result = await flowsImporter.getFlowFiles(testFlowsDir)

            result.should.be.an.Array()
            result.should.have.length(1) // only the flows.json file
        })

        it('should return empty array for invalid directory', async function () {
            const result = await flowsImporter.getFlowFiles('/path/does/not/exist')
            result.should.be.an.Array().and.be.empty()
        })

        it('should return empty array if package.json does not exist', async function () {
            const noPkgDir = path.join(tempDir, 'no-pkg')
            await fs.mkdir(noPkgDir)
            await fs.writeFile(path.join(noPkgDir, 'flows.json'), JSON.stringify(mockFlows))

            const result = await flowsImporter.getFlowFiles(noPkgDir)
            result.should.be.an.Array().and.be.empty()
        })
    })

    describe('getDirDetails', function () {
        it('should return valid directory details', async function () {
            const result = await flowsImporter.getDirDetails(testFlowsDir)

            result.should.have.property('valid', true)
            result.should.have.property('userDir', testFlowsDir)
            result.should.have.property('flowFiles').and.be.an.Array()
            result.should.have.property('packageFile', path.join(testFlowsDir, 'package.json'))
        })

        it('should return invalid details for directory without flows', async function () {
            const emptyDir = path.join(tempDir, 'empty')
            await fs.mkdir(emptyDir)
            await fs.writeFile(path.join(emptyDir, 'package.json'), '{}')

            const result = await flowsImporter.getDirDetails(emptyDir)
            result.should.have.property('valid', false)
            result.should.have.property('flowFiles').and.be.an.Array().and.be.empty()
        })
    })

    describe('askSelectFlowsFile', function () {
        it('should prompt user to select a flows file', async function () {
            const mockFlowFiles = [
                { name: 'flows.json', description: 'description 1', isFlowsFile: true },
                { name: 'flows2.json', description: 'description 2', isFlowsFile: true }
            ]

            Select.default.resolves(mockFlowFiles[0])

            const result = await flowsImporter.askSelectFlowsFile(mockFlowFiles)

            Select.default.calledOnce.should.be.true()
            result.should.deepEqual(mockFlowFiles[0])
        })

        it('should return false if user selects skip', async function () {
            const mockFlowFiles = [
                { name: 'flows.json', description: 'description 1', isFlowsFile: true }
            ]

            Select.default.resolves(false)
            // read the stdin to simulate user input
            const result = await flowsImporter.askSelectFlowsFile(mockFlowFiles)
            result.should.be.false()
        })

        it('should return false if no flow files are provided', async function () {
            const result = await flowsImporter.askSelectFlowsFile([])
            result.should.be.false()
        })

        it('should prompt user to select a flows file', async function () {
            const mockFlowFiles = [
                { name: 'flows.json', description: 'description 1', isFlowsFile: true },
                { name: 'flows2.json', description: 'description 2', isFlowsFile: true }
            ]

            Select.default.resolves(mockFlowFiles[0])

            const result = await flowsImporter.askSelectFlowsFile(mockFlowFiles)

            Select.default.calledOnce.should.be.true()
            result.should.deepEqual(mockFlowFiles[0])
        })
    })

    describe('askImportDirectory', function () {
        it('should return directory details if user selects a suggested directory', async function () {
            const mockDirDetails = { valid: true, userDir: testFlowsDir, flowFiles: [{ name: 'flows.json' }] }

            // Stub getDirDetails to return valid details for our test directory
            sandbox.stub(flowsImporter, 'getDirDetails').resolves(mockDirDetails)
            Select.default.resolves(mockDirDetails)

            const result = await flowsImporter.askImportDirectory([testFlowsDir])

            result.should.deepEqual(mockDirDetails)
            Select.default.calledOnce.should.be.true()
        })

        it('should prompt for custom path if user selects custom option', async function () {
            sandbox.stub(flowsImporter, 'getDirDetails').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [{ name: 'flows.json' }]
            })

            Select.default.resolves(-2) // CUSTOM option
            Input.default.resolves(testFlowsDir)
            Confirm.default.resolves(true)

            const result = await flowsImporter.askImportDirectory([])

            Input.default.calledOnce.should.be.true()
            result.should.have.property('valid', true)
            result.should.have.property('userDir', testFlowsDir)
        })

        it('should prompt with confirm dialog if no suggested dirs are provided', async function () {
            Confirm.default.resolves(false) // No to "Import existing Node-RED flows?"

            const result = await flowsImporter.askImportDirectory([])

            Confirm.default.calledOnce.should.be.true()
            result.should.have.property('skip', true)
        })

        it('should return skip result if user cancels custom path entry', async function () {
            Confirm.default.resolves(true) // Yes to "Import existing Node-RED flows?"
            Input.default.resolves('') // then skip

            // note, because we are not providing any suggested dirs, the choice is auto skipped
            // and user is simply asked to confirm "Import existing Node-RED flows?"

            const result = await flowsImporter.askImportDirectory([])

            result.should.be.false() // Skip import
        })
    })

    describe('flowImport', function () {
        it('should return null if user skips import', async function () {
            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({ skip: true })

            const result = await flowsImporter.flowImport([testFlowsDir])

            should(result).be.null()
        })

        it('should return null if user does not select a flows file', async function () {
            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [{ name: 'flows.json' }]
            })
            sandbox.stub(flowsImporter, 'askSelectFlowsFile').resolves(false)

            const result = await flowsImporter.flowImport([testFlowsDir])

            should(result).be.null()
        })

        it('should import flows, credentials and package data', async function () {
            // Create settings.js with credentialSecret
            const settingsJs = path.join(testFlowsDir, 'settings.js')
            await fs.writeFile(settingsJs, 'module.exports = { credentialSecret: "secret123" }')

            // Create .config.runtime.json
            const configRuntime = path.join(testFlowsDir, '.config.runtime.json')
            await fs.writeFile(configRuntime, JSON.stringify({ _credentialSecret: 'configSecret' }))

            const mockSelectedFlows = {
                isFlowsFile: true,
                userDir: testFlowsDir,
                name: 'flows.json',
                flowsFile: mockFlowsFile,
                credsFile: mockCredsFile,
                flows: mockFlows
            }

            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [mockSelectedFlows]
            })

            sandbox.stub(flowsImporter, 'askSelectFlowsFile').resolves(mockSelectedFlows)
            sandbox.stub(utils, 'loadAndParseJsonFile').callsFake(filePath => {
                if (filePath.includes('.config.runtime.json')) {
                    return { _credentialSecret: 'configSecret' }
                } else if (filePath.includes('settings.json')) {
                    return null
                }
                return null
            })

            sandbox.stub(utils, 'extractKeyValueFromJsContent').returns('secret123')
            sandbox.stub(utils, 'getPackageData').returns(mockPackageData)

            const result = await flowsImporter.flowImport([testFlowsDir])

            should(result).not.be.null()
            result.should.have.property('flows').and.be.an.Array()
            result.should.have.property('credentials').and.be.an.Object()
            result.should.have.property('credentialSecret', 'configSecret') // Should get from .config.runtime.json first
            result.should.have.property('package').and.be.an.Object()
        })

        it('should get credential secret from settings.json', async function () {
            // Create settings.json with credentialSecret
            const settingsJson = path.join(testFlowsDir, 'settings.json')
            await fs.writeFile(settingsJson, JSON.stringify({ credentialSecret: 'settingsJsonSecret' }))
            // Create settings.js with credentialSecret too (but it should be ignored)
            const settingsJs = path.join(testFlowsDir, 'settings.js')
            await fs.writeFile(settingsJs, 'module.exports = { credentialSecret: "settingsJsSecret" }')

            const mockSelectedFlows = {
                isFlowsFile: true,
                userDir: testFlowsDir,
                name: 'flows.json',
                flowsFile: mockFlowsFile,
                credsFile: mockCredsFile,
                flows: mockFlows
            }

            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [mockSelectedFlows]
            })

            sandbox.stub(flowsImporter, 'askSelectFlowsFile').resolves(mockSelectedFlows)
            sandbox.stub(utils, 'loadAndParseJsonFile').callsFake(filePath => {
                if (filePath.includes('.config.runtime.json')) {
                    return null // No runtime config
                } else if (filePath.includes('settings.json')) {
                    return { credentialSecret: 'settingsJsonSecret' }
                }
                return null
            })

            sandbox.stub(utils, 'getPackageData').returns(mockPackageData)
            sandbox.spy(utils, 'extractKeyValueFromJsContent')

            const result = await flowsImporter.flowImport([testFlowsDir])
            utils.loadAndParseJsonFile.calledTwice.should.be.true() // settings.json and .config.runtime.json
            utils.extractKeyValueFromJsContent.called.should.be.false() // not called because settings.json is used
            result.should.have.property('credentialSecret', 'settingsJsonSecret') // Should get from settings.json
        })

        it('should get credential secret from settings.js', async function () {
            // Create settings.js with credentialSecret
            const settingsJs = path.join(testFlowsDir, 'settings.js')
            await fs.writeFile(settingsJs, 'module.exports = { credentialSecret: "settingsJsSecret" }')

            const mockSelectedFlows = {
                isFlowsFile: true,
                userDir: testFlowsDir,
                name: 'flows.json',
                flowsFile: mockFlowsFile,
                credsFile: mockCredsFile,
                flows: mockFlows
            }

            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [mockSelectedFlows]
            })

            sandbox.stub(flowsImporter, 'askSelectFlowsFile').resolves(mockSelectedFlows)
            sandbox.stub(utils, 'loadAndParseJsonFile').callsFake(filePath => {
                return null // No runtime config or settings.json
            })

            sandbox.stub(utils, 'extractKeyValueFromJsContent').returns('settingsJsSecret')
            sandbox.stub(utils, 'getPackageData').returns(mockPackageData)

            const result = await flowsImporter.flowImport([testFlowsDir])
            utils.loadAndParseJsonFile.calledTwice.should.be.true() // settings.js and .config.runtime.json
            utils.extractKeyValueFromJsContent.calledOnce.should.be.true()
            result.should.have.property('credentialSecret', 'settingsJsSecret') // Should get from settings.js
        })

        it('should handle missing credentials file', async function () {
            // Delete credentials file
            await fs.unlink(mockCredsFile)

            const mockSelectedFlows = {
                isFlowsFile: true,
                userDir: testFlowsDir,
                name: 'flows.json',
                flowsFile: mockFlowsFile,
                credsFile: null, // No creds file
                flows: mockFlows
            }

            sandbox.stub(flowsImporter, 'askImportDirectory').resolves({
                valid: true,
                userDir: testFlowsDir,
                flowFiles: [mockSelectedFlows]
            })

            sandbox.stub(flowsImporter, 'askSelectFlowsFile').resolves(mockSelectedFlows)
            sandbox.stub(utils, 'getPackageData').returns(mockPackageData)

            const result = await flowsImporter.flowImport([testFlowsDir])

            result.should.have.property('credentials').and.be.empty()
        })
    })
})
