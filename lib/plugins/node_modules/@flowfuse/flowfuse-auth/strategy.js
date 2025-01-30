const util = require('util')
const url = require('url')
const OAuth2Strategy = require('passport-oauth2')

function Strategy (options, verify) {
    this.options = options
    this._base = Object.getPrototypeOf(Strategy.prototype)
    this._base.constructor.call(this, this.options, verify)
    this.name = 'FlowFuse'
    this.isSecure = /^https:/.test(options.authorizationURL)
    this.isRelativeCallback = !/^https?:/.test(options.callbackURL)
}

util.inherits(Strategy, OAuth2Strategy)

/**
 * Patch the authenticate function so we can do per-request generation of the
 * callback uri
 */
Strategy.prototype.__authenticate = Strategy.prototype.authenticate

Strategy.prototype.authenticate = function (req, options) {
    const strategyOptions = { ...options }

    if (this.isRelativeCallback) {
        // Get the base url of the request

        // This logic comes from passport_oauth2/lib/utils - but we use our
        // own check for whether to redirect to https or http based on the
        // authorizationURL we've been provided
        const app = req.app
        let trustProxy = this._trustProxy
        if (app && app.get && app.get('trust proxy')) {
            trustProxy = true
        }
        const protocol = this.isSecure ? 'https' : 'http'
        const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host
        const path = req.url || ''
        const base = protocol + '://' + host + path
        strategyOptions.callbackURL = (new url.URL(this.options.callbackURL, base)).toString()
    }

    return this.__authenticate(req, strategyOptions)
}

Strategy.prototype.userProfile = function (accessToken, done) {
    this._oauth2.useAuthorizationHeaderforGET(true)
    this._oauth2.get(this.options.userInfoURL, accessToken, (err, body) => {
        if (err) {
            return done(err)
        }
        try {
            const json = JSON.parse(body)
            done(null, {
                username: json.username,
                email: json.email,
                image: json.avatar,
                name: json.name,
                userId: json.id
            })
        } catch (e) {
            done(e)
        }
    })
}

module.exports = { Strategy }
