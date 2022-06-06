
let verbose = false
function log (msg, level) {
    console.log(`[${new Date().toISOString()}] ${level || 'INFO'}:`, msg)
}
module.exports = {
    initLogger: configuration => { verbose = configuration.verbose },
    info: msg => log(msg, 'INFO'),
    warn: msg => log(msg, 'WARN'),
    error: msg => log(msg, 'ERROR'),
    debug: msg => verbose && log(msg, 'DEBUG'),
    log
}
