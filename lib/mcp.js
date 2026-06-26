const path = require('path')
const { warn, debug } = require('./logging/log')

const CLIENT_NAME = 'flowfuse-launcher'
const CLIENT_VERSION = '1.0.0'

const MCP_SDK_PACKAGE = '@modelcontextprotocol/sdk'
const MCP_HOST_PACKAGE = '@flowfuse-nodes/nr-mcp-server-nodes'

/** Scope value the platform issues for tokens authorised to talk to MCP servers. */
const MCP_TOKEN_SCOPE = 'ff-expert:mcp'

/**
 * @typedef {object} accessToken
 * @property {string} [scheme] - auth scheme, e.g. 'Bearer'. Basic auth is currently rejected.
 * @property {string} [token] - the token value
 * @property {string|string[]} [scope] - token scope(s); only tokens including `ff-expert:mcp` are honoured
 *
 * @typedef {object} McpEndpointSpec - Specification for an MCP endpoint. Additional properties are allowed and will be passed back in the result (for correlation purposes).
 * @property {string} endpoint - The path of the MCP server e.g. '/mcp'. Should not contain the host/port; those are determined to agent/launcher
 * @property {object} [headers] - extra request headers to send with every MCP HTTP request
 * @property {accessToken} [accessToken] - access token; merged into `Authorization` when scoped for MCP
 *
 * @typedef {object} McpEndpoint {{ key: string, url: string, headers: object, skip: boolean, ... }} (additional properties allowed)
 * @property {string} key - unique key for the endpoint; used for result mapping and logging (often the same as `url`)
 * @property {string} url - MCP endpoint URL or path on the local Node-RED instance
 * @property {object} [headers] - extra request headers to send with every MCP HTTP request
 * @property {boolean} skip - when true, the endpoint should be skipped (e.g. due to unsupported auth scheme)}
 * @property {Error} [error] - if present, indicates an error that caused this endpoint to be skipped
 *
 * @typedef {import('@modelcontextprotocol/sdk/client').Client} McpClient
 * @typedef {import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport} StreamableHTTPClientTransport
 */

/**
 * Error thrown when the MCP SDK cannot be located/loaded from the Node-RED
 * instance. Carries a deliberately host-path-free message so it is safe to
 * surface back to the platform/UI; the underlying detail (attempted specifiers,
 * resolver error) is logged at debug level only. The original error, when any,
 * is attached as `cause`.
 */
class McpSdkUnavailableError extends Error {
    constructor (message, { cause } = {}) {
        super(message || 'MCP SDK is not available in this Node-RED instance')
        this.name = 'McpSdkUnavailableError'
        this.code = 'MCP_SDK_UNAVAILABLE'
        if (cause) {
            this.cause = cause
        }
    }
}

/**
 * Resolve an MCP SDK sub-module to an absolute, symlink-resolved file path,
 * scoped to the Node-RED project's node_modules. The SDK is shipped by
 * @flowfuse-nodes/nr-mcp-server-nodes (or any other Node-RED package that depends
 * on it), so it lives in the running Node-RED instance rather than the
 * device-agent's own dependencies.
 *
 * We use `require.resolve(..., { paths })` rather than hand-building a path into
 * `dist/cjs`: this honours the SDK's `exports` map and Node's full resolution
 * algorithm, so it keeps working across build-layout changes and non-flat
 * installs (npm-hoisted, host-nested, pnpm, yarn). `paths` keeps resolution
 * scoped to the project so an unrelated copy elsewhere can't be picked up.
 *
 * Resolution is attempted, in order, from:
 *   1. The host package's own node_modules:
 *      <projectDir>/node_modules/<host>/node_modules — where the SDK ends up when
 *      the host package is symlinked to a source checkout (npm cannot hoist deps
 *      across the symlink boundary).
 *   2. The project root node_modules:
 *      <projectDir>/node_modules — the normal hoisted `npm install` case.
 *
 * @param {string} subPath - sub-path within the SDK, e.g. 'client/index.js'
 * @param {string} projectDir - the Node-RED project directory (must contain node_modules)
 * @returns {string} absolute, symlink-resolved path to the SDK module file
 */
function resolveFromProject (subPath, projectDir) {
    if (!projectDir) {
        throw new Error('Node-RED project directory is not available')
    }
    const specifier = `${MCP_SDK_PACKAGE}/${subPath}`
    const paths = [
        path.join(projectDir, 'node_modules', MCP_HOST_PACKAGE, 'node_modules'),
        path.join(projectDir, 'node_modules')
    ]
    return require.resolve(specifier, { paths })
}

/**
 * Resolve an endpoint string to a URL.
 * - If it already parses as an absolute URL, it is used as-is.
 * - Otherwise it is treated as a path on the local Node-RED instance and joined to
 *   `http://127.0.0.1:<port>`. 127.0.0.1 is preferred over `localhost` to avoid
 *   IPv4/IPv6 resolution differences and hosts-file surprises.
 * @param {string} endpoint
 * @param {string} host
 * @param {number} port
 * @returns {URL}
 */
function endpointToUrl (endpoint, host, port) {
    try {
        const u = new URL(endpoint)
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            return u
        }
    } catch (_) { /* fall through to local-path handling */ }
    const pathPart = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    return new URL(`http://${host || '127.0.0.1'}:${port || 1880}${pathPart}`)
}

/**
 * Normalise an endpoint into a uniform shape the rest of the class can work with.
 * Accepts either a bare string (URL/path) or an object spec carrying auth/headers.
 *
 * @param {McpEndpointSpec|string} spec
 * @param {string} host
 * @param {number} port
 * @returns {McpEndpoint}
 *   `key` is what the result map is keyed by; `skip` is set when the endpoint
 *   should not be contacted (e.g. unsupported auth scheme).
 */
function normalizeEndpoint (spec, host, port) {
    if (typeof spec === 'string') {
        return {
            key: spec,
            url: endpointToUrl(spec, host, port).toString(),
            headers: { 'Content-Type': 'application/json' },
            skip: false
        }
    }
    if (!spec || typeof spec !== 'object' || typeof spec.mcpEndpoint !== 'string') {
        return {
            key: '<invalid>',
            skip: true,
            error: 'Invalid endpoint spec: must be a string or object with an "mcpEndpoint" property'
        }
    }
    const headers = { ...(spec.headers || {}) }
    if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
    }
    let skip = false
    const accessToken = spec.accessToken || null
    if (accessToken) {
        const { scheme, token, scope } = accessToken
        const expertScopedToken = scope === MCP_TOKEN_SCOPE || (Array.isArray(scope) && scope.includes(MCP_TOKEN_SCOPE))
        if (expertScopedToken) {
            if (scheme === 'Basic' || scheme === 'basic') {
                // Basic auth is currently unsupported; mark for the caller to skip.
                skip = true
            } else if (token) {
                headers.Authorization = scheme ? `${scheme} ${token}` : token
            }
        }
    }
    return {
        ...spec, // preserve any additional properties for correlation/logging purposes
        key: spec.mcpEndpoint,
        url: endpointToUrl(spec.mcpEndpoint, host, port).toString(),
        headers,
        skip
    }
}

/**
 * MCP client wrapper around the upstream `@modelcontextprotocol/sdk` Client.
 *
 * Configuration (port / project directory) is captured at construction time so that
 * call-site code only has to supply the per-request payload.
 */
class MCP {
    /**
     * @param {object} options
     * @param {string} options.nodeRedUserDir - Node-RED project directory containing node_modules; the MCP SDK is loaded from here
     * @param {string} [options.host='127.0.0.1'] - host to use when connecting to local endpoints; typically '127.0.0.1'
     * @param {number} options.port - local Node-RED HTTP port; used when an endpoint is a bare path rather than a full URL
     */
    constructor ({ nodeRedUserDir, host = '127.0.0.1', port } = {}) {
        this.nodeRedUserDir = nodeRedUserDir
        this.host = host
        this.port = port
        /** Cached SDK classes — populated on first successful load. */
        this._sdk = null
        /** Absolute paths the cached SDK was loaded from; used to purge the require cache on reset. */
        this._sdkPaths = null
    }

    // #region internal helpers

    /**
     * Lazy load and cache the MCP SDK classes used by this module.
     * Throws {@link McpSdkUnavailableError} if the SDK can't be located/loaded
     * from the Node-RED project's node_modules.
     * @returns {{ Client: McpClient, StreamableHTTPClientTransport: StreamableHTTPClientTransport }}
     * @throws {McpSdkUnavailableError}
     */
    _loadSdk () {
        if (this._sdk) {
            return this._sdk // already loaded and cached
        }
        let clientPath, transportPath
        try {
            clientPath = resolveFromProject('client/index.js', this.nodeRedUserDir)
            transportPath = resolveFromProject('client/streamableHttp.js', this.nodeRedUserDir)
        } catch (err) {
            // Keep host filesystem paths out of the surfaced error; log detail at debug level only.
            debug(`MCP SDK resolution failed: ${err.message}`)
            throw new McpSdkUnavailableError(undefined, { cause: err })
        }
        debug(`Loading MCP SDK from ${clientPath}`)
        const { Client } = require(clientPath)
        const { StreamableHTTPClientTransport } = require(transportPath)
        if (!Client || !StreamableHTTPClientTransport) {
            throw new McpSdkUnavailableError('MCP SDK loaded but expected exports are missing')
        }
        this._sdkPaths = [clientPath, transportPath]
        this._sdk = { Client, StreamableHTTPClientTransport }
        return this._sdk
    }

    /**
     * Drop the cached SDK reference and purge its entries from Node's require
     * cache, so the next {@link _loadSdk} re-resolves and reloads from disk.
     *
     * The launcher calls this whenever Node-RED is (re)started or stopped: the
     * project's node_modules may have just been reinstalled, relinked (Docker
     * module_cache), or removed, so any previously-loaded SDK could be stale or
     * gone. Purging the require cache matters for the in-place `npm install`
     * case, where the SDK is overwritten at the same path the process already
     * cached.
     */
    resetSdk () {
        this._sdk = null
        if (this._sdkPaths) {
            for (const p of this._sdkPaths) {
                this._purgeFromRequireCache(p)
            }
            this._sdkPaths = null
        }
    }

    /**
     * Delete the given module file and every other cached module under the same
     * SDK package root from `require.cache`, so a subsequent require reloads the
     * package fresh rather than stitching new entry points onto stale submodules.
     * The SDK is only ever required by this wrapper (Node-RED runs in a separate
     * child process), so purging is safe.
     * @param {string} resolvedPath - an absolute path inside the SDK package
     */
    _purgeFromRequireCache (resolvedPath) {
        const marker = `${path.sep}${MCP_SDK_PACKAGE.split('/').join(path.sep)}${path.sep}`
        const idx = resolvedPath.indexOf(marker)
        const pkgRoot = idx >= 0 ? resolvedPath.slice(0, idx + marker.length) : resolvedPath
        const matches = Object.keys(require.cache).filter(k => k === resolvedPath || k.startsWith(pkgRoot))
        for (const key of matches) {
            delete require.cache[key]
        }
    }

    /**
     * Connect a fresh MCP client to the given (already-normalised) endpoint spec.
     * Caller is responsible for `client.close()` when finished.
     * @param {McpEndpoint} endpoint
     * @returns {Promise<McpClient>} a connected MCP Client instance
     */
    async _connect (endpoint) {
        const { Client, StreamableHTTPClientTransport } = this._loadSdk()
        const transport = new StreamableHTTPClientTransport(endpoint.url, {
            requestInit: { headers: endpoint.headers }
        })
        const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION })
        await client.connect(transport)
        return client
    }

    async _getEndpointFeatures (/** @type {McpEndpoint} */ endpoint) {
        const features = {
            tools: [],
            resources: [],
            resourceTemplates: [],
            prompts: [],
            capabilities: {}
        }
        /** @type {McpClient} */
        let client
        try {
            client = await this._connect(endpoint)
            const capabilities = client.getServerCapabilities() || {}
            features.capabilities = capabilities

            if (capabilities.tools) {
                try {
                    const { tools } = await client.listTools()
                    features.tools = tools || []
                } catch (err) {
                    debug(`MCP listTools failed for ${endpoint.key}: ${err.message}`)
                }
            }
            if (capabilities.resources) {
                try {
                    const { resources } = await client.listResources()
                    features.resources = resources || []
                } catch (err) {
                    debug(`MCP listResources failed for ${endpoint.key}: ${err.message}`)
                }
                try {
                    const { resourceTemplates } = await client.listResourceTemplates()
                    features.resourceTemplates = resourceTemplates || []
                } catch (err) {
                    debug(`MCP listResourceTemplates failed for ${endpoint.key}: ${err.message}`)
                }
            }
            if (capabilities.prompts) {
                try {
                    const { prompts } = await client.listPrompts()
                    features.prompts = prompts || []
                } catch (err) {
                    debug(`MCP listPrompts failed for ${endpoint.key}: ${err.message}`)
                }
            }
        } catch (err) {
            warn(`Failed to query MCP endpoint '${endpoint.key}': ${err.message}`)
            features.error = err.message
        } finally {
            if (client) {
                try {
                    await client.close()
                } catch (_) { /* ignore */ }
            }
        }
        return features
    }

    // #endregion internal helpers

    // #region Public API

    /**
     * Get a list of features from MCP server(s) running in the Node-RED instance.
     * @param {Array<string|McpEndpointSpec>} endpoints - list of MCP endpoints to query.
     *   Each entry may be a bare URL/path string, or an object `{ url, headers?, accessToken? }`
     *   where `accessToken` is `{ scheme, token, scope }`.
     * @returns {Promise<Record<string, object>>} a map of endpoint key/url to features or error; the key is typically the URL or `spec.url` value
     */
    async getFeatures (endpoints) {
        const result = []
        if (!Array.isArray(endpoints) || endpoints.length === 0) {
            return result
        }
        const normalisedEndpoints = endpoints.map(e => normalizeEndpoint(e, this.host, this.port))

        // Fail fast if the SDK isn't installed/available.
        try {
            this._loadSdk()
        } catch (err) {
            warn(`MCP SDK not available: ${err.message}`)
            for (const endpoint of normalisedEndpoints) {
                result.push({
                    spec: endpoint,
                    error: `MCP SDK not available: ${err.message}`
                })
            }
            return result
        }

        await Promise.all(normalisedEndpoints.map(async (spec) => {
            /** @type {McpEndpoint} */
            if (spec.error) {
                result.push({
                    spec,
                    error: spec.error
                })
                return
            }
            if (spec.skip) {
                result.push({
                    spec,
                    error: 'Endpoint skipped: unsupported auth scheme'
                })
                return
            }
            const features = await this._getEndpointFeatures(spec)
            const reply = {
                spec,
                features,
                error: features.error || null
            }
            result.push(reply)
        }))
        return result
    }

    /**
     * Call a tool on an MCP server running in the Node-RED instance.
     * Throws on any failure (caller is expected to convert to an error response).
     * @param {string|McpEndpointSpec} endpoint - MCP endpoint URL/path, or `{ url, headers?, accessToken? }`
     * @param {string} name - name of the tool to invoke
     * @param {object} [input] - arguments to pass to the tool
     * @returns {Promise<object>} the tool call result as returned by the MCP server
     */
    async callTool (endpoint, name, input) {
        if (!endpoint) {
            throw new Error('endpoint is required')
        }
        if (!name) {
            throw new Error('Tool name is required')
        }
        const spec = normalizeEndpoint(endpoint, this.host, this.port)
        if (spec.skip) {
            throw new Error('Endpoint skipped: unsupported auth scheme')
        }
        let client
        try {
            client = await this._connect(spec)
            const response = await client.callTool({ name, arguments: input || {} })
            return response
        } finally {
            if (client) {
                try {
                    await client.close()
                } catch (_) { /* ignore */ }
            }
        }
    }

    /**
     * Read a resource from an MCP server running in the Node-RED instance.
     * Throws on any failure (caller is expected to convert to an error response).
     * @param {string|McpEndpointSpec} endpoint - MCP endpoint URL/path, or `{ url, headers?, accessToken? }`
     * @param {string} uri - URI of the resource
     * @returns {Promise<object>} the resource read result
     */
    async readResource (endpoint, uri) {
        if (!endpoint) {
            throw new Error('endpoint is required')
        }
        if (!uri) {
            throw new Error('Resource URI is required')
        }
        const spec = normalizeEndpoint(endpoint, this.host, this.port)
        if (spec.skip) {
            throw new Error('Endpoint skipped: unsupported auth scheme')
        }

        let client
        try {
            client = await this._connect(spec)
            const response = await client.readResource({ uri })
            return response
        } finally {
            if (client) {
                try {
                    await client.close()
                } catch (_) { /* ignore */ }
            }
        }
    }

    // #endregion public API
}

module.exports = {
    MCP,
    McpSdkUnavailableError
}
