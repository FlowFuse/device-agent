let verbose = false
function log (msg, level) {
    const date = new Date()
    console.log(`[AGENT] ${date.toLocaleDateString()} ${date.toLocaleTimeString()} [${level || 'info'}] ${msg}`) // eslint-disable-line no-console
}
module.exports = {
    initLogger: configuration => { verbose = configuration.verbose },
    info: msg => log(msg, 'info'),
    warn: msg => log(msg, 'warn'),
    error: msg => log(msg, 'error'),
    debug: msg => verbose && log(msg, 'debug'),
    log
}
