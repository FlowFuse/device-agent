const { OAuth2 } = require('oauth')
const { Strategy } = require('./strategy')

module.exports = (options) => {
    ['clientID', 'clientSecret', 'forgeURL', 'baseURL'].forEach(prop => {
        if (!options[prop]) {
            throw new Error(`Missing configuration option ${prop}`)
        }
    })

    const clientID = options.clientID
    const clientSecret = options.clientSecret
    const forgeURL = options.forgeURL
    const teamID = options.teamID
    const baseURL = new URL(options.baseURL)
    let basePath = baseURL.pathname || ''
    if (basePath.endsWith('/')) {
        basePath = basePath.substring(0, basePath.length - 1)
    }
    const callbackURL = `${basePath}/auth/strategy/callback`
    const authorizationURL = `${forgeURL}/account/authorize`
    const tokenURL = `${forgeURL}/account/token`
    const userInfoURL = `${forgeURL}/api/v1/user`
    const userTeamRoleURL = `${forgeURL}/api/v1/teams/${teamID}/user`

    const oa = new OAuth2(clientID, clientSecret, '', authorizationURL, tokenURL)

    const version = require('../../package.json').version

    const activeUsers = {}

    function addUser (username, profile, refreshToken, expiresIn) {
        if (activeUsers[username]) {
            clearTimeout(activeUsers[username].refreshTimeout)
        }
        activeUsers[username] = {
            profile,
            refreshToken,
            expiresIn
        }
        activeUsers[username].refreshTimeout = setTimeout(function () {
            oa.getOAuthAccessToken(refreshToken, {
                grant_type: 'refresh_token'
            }, function (err, accessToken, refreshToken, results) {
                if (err) {
                    delete activeUsers[username]
                } else {
                    addUser(username, profile, refreshToken, results.expires_in)
                }
            })
        }, expiresIn * 1000)
    }

    return {
        type: 'strategy',
        strategy: {
            name: 'FlowFuse',
            autoLogin: true,
            label: 'Sign in',
            strategy: Strategy,
            options: {
                authorizationURL,
                tokenURL,
                callbackURL,
                userInfoURL,
                userTeamRoleURL,
                scope: `editor-${version}`,
                clientID,
                clientSecret,
                pkce: true,
                state: true,
                verify: function (accessToken, refreshToken, params, profile, done) {
                    profile.permissions = [params.scope || 'read']
                    addUser(profile.username, profile, refreshToken, params.expires_in)
                    done(null, profile)
                }
            }
        },
        users: async function (username) {
            return activeUsers[username] && activeUsers[username].profile
        }
    }
}
