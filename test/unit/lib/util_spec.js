const should = require('should') // eslint-disable-line
const utils = require('../../../lib/utils.js')

/*
    Ensure utils used throughout agent are tested
    * compareNodeRedData,
    * compareObjects,
    * isObject,
    * hasProperty
*/
describe('utils', function () {
    describe('isObject', function () {
        it('should return true for objects', function () {
            utils.isObject({}).should.be.true()
            utils.isObject({ a: 1 }).should.be.true()
            utils.isObject(new Date()).should.be.true()
        })
        it('should return false for non-objects', function () {
            utils.isObject(null).should.be.false()
            utils.isObject(undefined).should.be.false()
            utils.isObject('string').should.be.false()
            utils.isObject(1).should.be.false()
            utils.isObject(true).should.be.false()
            utils.isObject(false).should.be.false()
        })
    })
    describe('hasProperty', function () {
        it('should return true for objects with property', function () {
            utils.hasProperty({ a: 1 }, 'a').should.be.true()
            utils.hasProperty({ a: undefined }, 'a').should.be.true()
            utils.hasProperty({ a: null }, 'a').should.be.true()
            utils.hasProperty({ a: false }, 'a').should.be.true()
            utils.hasProperty({ a: true }, 'a').should.be.true()
            utils.hasProperty({ a: 0 }, 'a').should.be.true()
        })
        it('should return false for objects without property', function () {
            utils.hasProperty({}, 'a').should.be.false()
            utils.hasProperty({ a: 1 }, 'b').should.be.false()
        })
        it('should return false for non-objects', function () {
            utils.hasProperty(null, 'a').should.be.false()
            utils.hasProperty(undefined, 'a').should.be.false()
            utils.hasProperty('string', 'a').should.be.false()
            utils.hasProperty(1, 'a').should.be.false()
            utils.hasProperty(true, 'a').should.be.false()
            utils.hasProperty(false, 'a').should.be.false()
        })
    })
    describe('compareObjects', function () {
        it('should return true for equal objects', function () {
            utils.compareObjects({ a: 1 }, { a: 1 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { a: 1, b: 2 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { b: 2, a: 1 }).should.be.true()
            utils.compareObjects({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }).should.be.false()
            utils.compareObjects(null, null).should.be.true()
        })
        it('should return false for non-objects', function () {
            utils.compareObjects(undefined, undefined).should.be.false() // equal, but not not objects
            utils.compareObjects(null, undefined).should.be.false()
            utils.compareObjects(undefined, null).should.be.false()
            utils.compareObjects('string', 'string').should.be.false() // equal, but not not objects
            utils.compareObjects('string', null).should.be.false()
            utils.compareObjects(null, 'string').should.be.false()
            utils.compareObjects(1, 1).should.be.false() // equal, but not not objects
            utils.compareObjects(0, null).should.be.false() // == but not === and 0 is not an object
            utils.compareObjects(null, 1).should.be.false()
            utils.compareObjects(true, true).should.be.false() // equal, but not not objects
            utils.compareObjects(true, null).should.be.false()
            utils.compareObjects(null, true).should.be.false()
            utils.compareObjects(false, false).should.be.false() // equal, but not not objects
            utils.compareObjects(false, null).should.be.false()
            utils.compareObjects(null, false).should.be.false()
        })
    })
    describe('compareNodeRedData', function () {
        it('should return true for equal objects. flows + modules', function () {
            const nrd1 = { flows: [{ id: '1' }, { id: '2' }], modules: { 'node-red': 'latest' } }
            const nrd2 = { flows: [{ id: '1' }, { id: '2' }], modules: { 'node-red': 'latest' } }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return true for equal objects. flows', function () {
            const nrd1 = { flows: [{ id: '1' }, { id: '2' }] }
            const nrd2 = { flows: [{ id: '1' }, { id: '2' }] }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return true for equal objects. modules', function () {
            const nrd1 = { modules: { 'node-red': 'latest' } }
            const nrd2 = { modules: { 'node-red': 'latest' } }
            utils.compareNodeRedData(nrd1, nrd2).should.be.true()
        })
        it('should return false for unequal flows', function () {
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: [{ id: '2' }] }).should.be.false()
            utils.compareNodeRedData({ flows: [] }, { flows: [{ id: '3' }] }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: [] }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: null }).should.be.false()
            utils.compareNodeRedData({ flows: [{ id: '1' }] }, { flows: undefined }).should.be.false()
        })
        it('should return false for unequal modules', function () {
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: { 'node-red': '3.0.0' } }).should.be.false()
            utils.compareNodeRedData({ modules: {} }, { modules: { 'node-red': '3.0.2' } }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: {} }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: null }).should.be.false()
            utils.compareNodeRedData({ modules: { 'node-red': 'latest' } }, { modules: undefined }).should.be.false()
        })
    })
})
