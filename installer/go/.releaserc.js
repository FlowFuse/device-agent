module.exports = {
    tagFormat: 'installer-v${version}', // eslint-disable-line no-template-curly-in-string
    branches: ['main'],
    plugins: [
        ['@semantic-release/commit-analyzer', {
            preset: 'angular',
            releaseRules: [
                { scope: '!installer', release: false },
                { scope: 'installer', type: 'feat', release: 'minor' },
                { scope: 'installer', type: 'fix', release: 'patch' },
                { scope: 'installer', type: 'perf', release: 'patch' },
                { scope: 'installer', type: 'refactor', release: 'patch' },
                { scope: 'installer', type: 'chore', release: 'patch' },
                { scope: 'installer', type: 'docs', release: 'patch' },
                { scope: 'installer', type: 'style', release: 'patch' },
                { scope: 'installer', type: 'test', release: 'patch' },
                { scope: 'installer', breaking: true, release: 'major' }
            ],
            parserOpts: {
                noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES']
            }
        }],
        ['@semantic-release/release-notes-generator', {
            preset: 'angular',
            parserOpts: {
                noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES']
            },
            writerOpts: {
                transform: (commit) => {
                    // Only include commits with 'installer' scope
                    if (commit.scope !== 'installer') {
                        return false
                    }
                    // Clear the scope to prevent it from being displayed
                    commit.scope = null
                    return commit
                }
            }
        }],
        ['@semantic-release/github', {
            releaseNameTemplate: 'Installer v${nextRelease.version}', // eslint-disable-line no-template-curly-in-string
            successComment: false,
            assets: [
                {
                    path: 'release-artifacts/flowfuse-device-installer-linux-amd64'
                },
                {
                    path: 'release-artifacts/flowfuse-device-installer-linux-arm64'
                },
                {
                    path: 'release-artifacts/flowfuse-device-installer-linux-arm'
                },
                {
                    path: 'release-artifacts/flowfuse-device-installer-windows-amd64.exe'
                },
                {
                    path: 'release-artifacts/flowfuse-device-installer-darwin-amd64'
                },
                {
                    path: 'release-artifacts/flowfuse-device-installer-darwin-arm64'
                }
            ]
        }]
    ]
}
