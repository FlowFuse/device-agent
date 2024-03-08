/**
 * @typedef {Object} States
 * @property {string} UNKNOWN - not a state nr-launcher supports (unique to nr-device-agent)
 * @property {string} UPDATING - not a state nr-launcher supports (unique to nr-device-agent)
 * @property {string} PROVISIONING - not a state nr-launcher supports (unique to nr-device-agent)
 * @property {string} SUSPENDED - not a state nr-launcher supports (unique to nr-device-agent)
 * @property {string} STOPPED
 * @property {string} LOADING
 * @property {string} INSTALLING
 * @property {string} STARTING
 * @property {string} RUNNING
 * @property {string} SAFE
 * @property {string} CRASHED
 * @property {string} STOPPING
 * @property {string} ERROR - not a state nr-launcher supports (unique to nr-device-agent)
 */

/** @type {States} */
const States = {
    UNKNOWN: 'unknown',
    UPDATING: 'updating',
    PROVISIONING: 'provisioning',
    SUSPENDED: 'suspended',
    STOPPED: 'stopped',
    LOADING: 'loading',
    INSTALLING: 'installing',
    STARTING: 'starting',
    RUNNING: 'running',
    SAFE: 'safe',
    CRASHED: 'crashed',
    STOPPING: 'stopping',
    ERROR: 'error'
}

const TargetStates = [States.RUNNING, States.SUSPENDED]
const TransitionStates = [States.LOADING, States.INSTALLING, States.STARTING, States.STOPPING, States.UPDATING]

/**
 * Checks if a state is valid.
 *
 * @param {string} state - The state to check.
 * @returns {boolean} True if the state is valid, false otherwise.
 */
function isValidState (state) {
    return Object.values(States).includes(state)
}

/**
 * Checks if a target state is valid.
 *
 * @param {string} state - The state to check.
 * @returns {boolean} True if the target state is valid, false otherwise.
 */
function isTargetState (state) {
    return TargetStates.includes(state)
}

/**
 * Checks if a transition state is valid.
 *
 * @param {string} state - The state to check.
 * @returns {boolean} True if the transition state is valid, false otherwise.
 */
function isTransitionState (state) {
    return TransitionStates.includes(state)
}

module.exports = {
    States,
    isValidState,
    isTargetState,
    isTransitionState
}
