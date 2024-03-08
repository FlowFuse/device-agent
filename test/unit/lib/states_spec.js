// eslint-disable-next-line no-unused-vars
const should = require('should')

const { States, isValidState, isTargetState, isTransitionState } = require('../../../lib/states')

describe('State validation', () => {
    it('isValidState should return true for valid states', () => {
        // just a selection of states to check the function
        isValidState(States.RUNNING).should.be.true()
        isValidState(States.STARTING).should.be.true()
        isValidState(States.STOPPED).should.be.true()
        isValidState(States.STOPPING).should.be.true()
        isValidState(States.PROVISIONING).should.be.true()
        isValidState(States.SUSPENDED).should.be.true()
        isValidState(States.ERROR).should.be.true()
        isValidState(States.UNKNOWN).should.be.true()
        isValidState(States.SAFE).should.be.true()
    })

    it('isValidState should return false for invalid states', () => {
        isValidState('INVALID_STATE').should.be.false()
    })

    it('isTargetState should return true for valid target states', () => {
        isTargetState(States.RUNNING).should.be.true()
        isTargetState(States.SUSPENDED).should.be.true()
    })

    it('isTargetState should return false for invalid target states', () => {
        isTargetState('INVALID_STATE').should.be.false()
        isTargetState(States.ERROR).should.be.false()
        isTargetState(States.UNKNOWN).should.be.false()
    })

    it('isTransitionState should return true for valid transition states', () => {
        isTransitionState(States.STARTING).should.be.true()
        isTransitionState(States.STOPPING).should.be.true()
        isTransitionState(States.LOADING).should.be.true()
        isTransitionState(States.INSTALLING).should.be.true()
        isTransitionState(States.UPDATING).should.be.true()
    })

    it('isTransitionState should return false for invalid transition states', () => {
        isTransitionState('INVALID_STATE').should.be.false()
        isTransitionState(States.ERROR).should.be.false()
        isTransitionState(States.RUNNING).should.be.false()
        isTransitionState(States.STOPPED).should.be.false()
        isTransitionState(States.SAFE).should.be.false()
    })
})
