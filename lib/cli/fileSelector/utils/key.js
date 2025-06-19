const {
    isBackspaceKey,
    isDownKey,
    isEnterKey,
    isSpaceKey,
    isUpKey
} = require('@inquirer/core')

/** Check if the given key is the Escape key. */
function isEscapeKey (key) {
    return key.name === 'escape'
}
/** Check if the given key is the right Arrow. */
function isRightArrowKey (key) {
    return key.name === 'right'
}
/** Check if the given key is the left Arrow. */
function isLeftArrowKey (key) {
    return key.name === 'left'
}

function isPageDown (key) {
    return key.name === 'pagedown'
}

function isPageUp (key) {
    return key.name === 'pageup'
}

module.exports = {
    isBackspaceKey,
    isDownKey,
    isEnterKey,
    isSpaceKey,
    isUpKey,
    isEscapeKey,
    isRightArrowKey,
    isLeftArrowKey,
    isPageUp,
    isPageDown
}
