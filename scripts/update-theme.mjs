import * as url from 'url'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { execFileSync } from 'child_process'

// setup constants
const __dirname = url.fileURLToPath(new URL('..', import.meta.url))
const packageDirectory = __dirname
const tempDirectory = path.join(packageDirectory, 'temp')
const outputDirectory = path.join(packageDirectory, 'theme')
const outputSrcDirectory = path.join(outputDirectory, 'lib/theme')
const resources = 'resources'
const outputResourceDest = path.join(outputDirectory, resources)
const repositoryLocal = path.join(packageDirectory, '../flowforge-nr-launcher')
const repositoryUser = 'flowforge'
const repositoryName = 'flowforge-nr-launcher'
const repositoryUrl = `https://github.com/${repositoryUser}/${repositoryName}.git'`
const repositoryPath = 'lib/theme'

// Main
await cleanUp(tempDirectory)
await cleanUp(outputDirectory)
let footer = 'These files were auto generated'
if (existsSync(repositoryLocal)) {
    const themeSource = path.join(repositoryLocal, repositoryPath)
    const resourceSource = path.join(repositoryLocal, resources)
    const pkg = JSON.parse(await fs.readFile(path.join(repositoryLocal, 'package.json')))
    await fs.cp(themeSource, outputSrcDirectory, { recursive: true })
    await fs.cp(resourceSource, outputResourceDest, { recursive: true })
    footer += ` from a local install of [${repositoryUser}/${repositoryName}](${repositoryUrl}), version ${pkg.version}`
} else {
    const hash = await download({ repositoryUrl, branch: 'main', repositoryPath, tempDirectory, finalDirectory: outputDirectory })
    // copy files, sub folders and sub folder files to the final directory
    const themeSource = path.join(tempDirectory, repositoryPath)
    const resourceSource = path.join(tempDirectory, resources)
    await fs.mkdir(outputDirectory, { recursive: true })
    await fs.cp(themeSource, outputSrcDirectory, { recursive: true })
    await fs.cp(resourceSource, outputResourceDest, { recursive: true })
    await cleanUp(tempDirectory)
    footer += ` from [${repositoryUser}/${repositoryName}](${repositoryUrl}) at commit [${hash}](${repositoryUrl}/commit/${hash})`
}
await writeReadme(outputDirectory, footer)
writePackageFile(outputDirectory)
// delete the scripts folder from the final directory
const scriptsPath = path.join(outputDirectory, 'scripts')
await cleanUp(scriptsPath)
console.log('Theme files updated')

async function writeReadme (dir, footer) {
    const readmePath = path.join(dir, 'README.md')
    const readme = []
    readme.push('**DO NOT MODIFY THESE FILES DIRECTLY**\n\n')
    readme.push('This directory contains the flowforge theme files for Node-RED\n\n')
    readme.push('All files in this directory are generated by the script `scripts/update_theme.js`\n\n')
    readme.push('To update the theme, run `npm run update-theme`\n\n')
    if (footer) {
        readme.push(footer)
    }
    readme.push('\n')
    await fs.writeFile(readmePath, readme)
}

async function writePackageFile (dir) {
    const packagePath = path.join(dir, 'package.json')
    const pkgData = {
        name: '@flowforge/flowforge-nr-theme',
        version: '0.0.0',
        description: 'FlowForge themes for Node-RED',
        info: 'This package was generated by the script `flowforge-device-agent/scripts/update_theme.mjs`',
        license: 'Apache-2.0',
        'node-red': {
            version: '>=2.2.0',
            plugins: {
                'forge-light': 'lib/theme/forge-light/forge-light.js',
                'forge-dark': 'lib/theme/forge-dark/forge-dark.js'
            }
        },
        engines: {
            node: '>=16.x'
        }
    }
    await fs.writeFile(packagePath, JSON.stringify(pkgData, null, 4))
}
async function cleanUp (path) {
    if (!existsSync(path)) return
    // if it is a file, delete it using fs.unlink otherwise use fs.rm
    const stat = await fs.stat(path)
    if (stat.isFile()) {
        await fs.unlink(path)
        return
    }
    await fs.rm(path, { recursive: true })
}

function git (cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

async function download ({ repositoryUrl, branch = 'master', repositoryPath, tempDirectory, finalDirectory }) {
    if (!existsSync(tempDirectory)) {
        git(null, 'clone', '--filter=blob:none', '--no-checkout', repositoryUrl, tempDirectory)
        git(tempDirectory, 'sparse-checkout', 'init', '--cone')
        git(tempDirectory, 'sparse-checkout', 'set', repositoryPath)
    }
    git(tempDirectory, '-c', 'advice.detachedHead=false', 'checkout', branch)
    git(tempDirectory, 'pull', 'origin', branch)
    const hash = git(tempDirectory, 'ls-tree', 'HEAD', repositoryPath)
    const match = hash.match(/^\S+\s+\S+\s+(\S+)\s*/)
    const hashId = match[1]
    return hashId
}