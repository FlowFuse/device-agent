/*
 * IMPORTANT
    * This plugin is a duplicate of the one in flowforge-nr-launcher/lib/storage/libraryPlugin.js
      Any changes made to either should be made to both.
    * This is needed here because a device, edited via a tunnel in developer mode, also needs to
      be able to access the team library.
 * NOTE
    * This is MVP & should be considered as a candidate for refactoring into a single plugin.
*/

const { default: got } = require('got')

module.exports = function (RED) {
    const PLUGIN_TYPE_ID = 'flowforge-team-library'

    class FFTeamLibraryPlugin {
        constructor (config) {
            this.type = PLUGIN_TYPE_ID
            this.id = config.id
            this.label = config.label
            const { projectID, libraryID, token } = config
            if (!projectID) {
                throw new Error('Missing required configuration property: projectID')
            }
            if (!libraryID) {
                throw new Error('Missing required configuration property: libraryID')
            }
            if (!token) {
                throw new Error('Missing required configuration property: token')
            }
            this._client = got.extend({
                prefixUrl: config.baseURL + '/library/' + libraryID + '/',
                headers: {
                    'user-agent': 'FlowForge HTTP Storage v0.1',
                    authorization: 'Bearer ' + token
                },
                timeout: {
                    request: 10000
                }
            })
        }

        /**
         * Initialise the store.
         */
        async init () {
        }

        /**
         * Get an entry from the store
         * @param {string} type The type of entry, for example, "flow"
         * @param {string} path The path to the library entry
         * @return if 'path' resolves to a single entry, it returns the contents
         *         of that entry.
         *         if 'path' resolves to a 'directory', it returns a listing of
         *         the contents of the directory
         *         if 'path' is not valid, it should throw a suitable error
         */
        async getEntry (type, name) {
            return this._client.get(name, {
                searchParams: {
                    type
                }
            }).then(entry => {
                if (entry.headers['content-type'].startsWith('application/json')) {
                    return JSON.parse(entry.body)
                } else {
                    return entry.body
                }
            })
        }

        /**
         * Save an entry to the library
         * @param {string} type The type of entry, for example, "flow"
         * @param {string} path The path to the library entry
         * @param {object} meta An object of key/value meta data about the entry
         * @param {string} body The entry contents
         */
        async saveEntry (type, name, meta, body) {
            return this._client.post(name, {
                json: {
                    name,
                    type,
                    meta,
                    body
                },
                responseType: 'json'
            })
        }
    }

    RED.plugins.registerPlugin(PLUGIN_TYPE_ID, {
        type: 'node-red-library-source',
        class: FFTeamLibraryPlugin,
        onadd: () => {
            RED.log.info('FlowForge Team Library Plugin loaded')
        }
    })
}
