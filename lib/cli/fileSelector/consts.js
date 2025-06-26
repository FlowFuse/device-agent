/** ANSI escape code to hide the cursor. */
const ANSI_HIDE_CURSOR = '\x1B[?25l'

/** Possible prompt statuses. */
const Status = {
    Idle: 'idle',
    Done: 'done',
    Canceled: 'canceled'
}

module.exports = { ANSI_HIDE_CURSOR, Status }
