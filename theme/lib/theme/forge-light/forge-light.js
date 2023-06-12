module.exports = function (RED) {
    console.log('FlowForge Light Theme Plugin loaded')
    RED.plugins.registerPlugin('forge-light', {
        type: 'node-red-theme',
        scripts: [
            'lib/theme/common/forge-common.js'
            // /* optional */ 'lib/theme/forge-light/forge-light-custom.js'
        ],
        css: [
            'lib/theme/common/forge-common.css',
            'lib/theme/forge-light/forge-light-theme.css'
            // /* optional */ 'lib/theme/forge-light/forge-light-custom.css'
        ],
        settings: {
            theme: {
                value: 'forge-light',
                exportable: true
            },
            headerImage: {
                value: 'resources/@flowforge/nr-launcher/ff-nr.png',
                exportable: true
            },
            favicon: {
                value: 'resources/@flowforge/nr-launcher/favicon-16x16.png',
                exportable: true
            },
            launcherVersion: {
                exportable: true
            },
            forgeURL: {
                exportable: true
            },
            projectURL: {
                exportable: true
            }
        },
        monacoOptions: {
            theme: require('./forge-light-monaco.json'),
            fontSize: 14,
            fontLigatures: true,
            fontFamily: "Cascadia Code, Fira Code, Consolas, 'Courier New', monospace",
            fontWeight: '300',
            colorDecorators: true,
            dragAndDrop: true,
            linkedEditing: true,
            showFoldingControls: 'always',
            'bracketPairColorization.enabled': true
        }
    })
}
