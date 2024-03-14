const States = {
    UNKNOWN: 'unknown',
    UPDATING: 'updating',
    PROVISIONING: 'provisioning',
    SUSPENDED: 'suspended',
    STOPPED: 'stopped',
    LOADING: 'loading',
    INSTALLING: 'installing',
    STARTING: 'starting',
    RESTARTING: 'restarting',
    RUNNING: 'running',
    SAFE: 'safe',
    CRASHED: 'crashed',
    STOPPING: 'stopping',
    ERROR: 'error'
}

const TargetStates = [States.RUNNING, States.SUSPENDED]
const TransitionStates = [States.LOADING, States.INSTALLING, States.STARTING, States.STOPPING, States.UPDATING, States.RESTARTING, States.PROVISIONING]

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
