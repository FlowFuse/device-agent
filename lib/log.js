let verbose = false
function log (msg, level) {
    console.log(`[AGENT] ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })} ${level || 'info'}:`, msg)
}
module.exports = {
    initLogger: configuration => { verbose = configuration.verbose },
    info: msg => log(msg, 'info'),
    warn: msg => log(msg, 'warn'),
    error: msg => log(msg, 'error'),
    debug: msg => verbose && log(msg, 'debug'),
    log
}
