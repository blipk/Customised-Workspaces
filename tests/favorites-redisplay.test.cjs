/* eslint-env node */
const assert = require( "node:assert/strict" )
const fs = require( "node:fs" )
const path = require( "node:path" )
const test = require( "node:test" )
const vm = require( "node:vm" )

// Evaluate the actual class methods with GI dependencies supplied as mocks.
// Constructors and their compositor objects are not instantiated by these tests.
function loadClass( file, name, dependencies ) {
    const source = fs.readFileSync( path.join( __dirname, "../worksets@blipk.xyz", file ), "utf8" )
        .replace( /^import .+$/gm, "" )
        .replace( /^export class /gm, "class " )
    return vm.runInNewContext( `${source}\n${name}`, dependencies, { filename: file } )
}

function redisplayFixture() {
    const calls = []
    const queued = []
    const Me = { session: { favoritesSet: true } }
    const Main = {
        overview: { visible: false, _overview: { controls: { appDisplay: { _redisplayWorkId: "grid-work" } } } },
        queueDeferredWork( id ) { queued.push( id ) },
    }
    const Manager = loadClass( "workspaceView.js", "WorkspaceViewManager", { Me, Main } )
    const actor = { mapped: false }
    const wrapper = Manager.prototype._createFavoritesRedisplayOverride( function originalRedisplay( ...args ) {
        calls.push( { actor: this, args } )
        return "redisplayed"
    } )
    return { Me, Main, actor, wrapper, calls, queued }
}

test( "favorites changes defer hidden main and folder views through the main grid work id", () => {
    const fixture = redisplayFixture()
    fixture.wrapper.call( fixture.actor )
    fixture.wrapper.call( { mapped: false } )
    assert.deepEqual( fixture.queued, ["grid-work", "grid-work"] )
    assert.equal( fixture.calls.length, 0 )
} )

test( "the deferred callback executes normally after the favorites write finishes", () => {
    const fixture = redisplayFixture()
    fixture.wrapper.call( fixture.actor )
    fixture.Me.session.favoritesSet = false
    assert.equal( fixture.wrapper.call( fixture.actor, "flush" ), "redisplayed" )
    assert.equal( fixture.calls.length, 1 )
    assert.equal( fixture.calls[0].args[0], "flush" )
} )

for ( const scenario of ["visible overview", "mapped actor", "unrelated refresh", "missing work id", "missing session"] ) {
    test( `${scenario} keeps synchronous redisplay, receiver, arguments and return value`, () => {
        const fixture = redisplayFixture()
        if ( scenario === "visible overview" ) fixture.Main.overview.visible = true
        if ( scenario === "mapped actor" ) fixture.actor.mapped = true
        if ( scenario === "unrelated refresh" ) fixture.Me.session.favoritesSet = false
        if ( scenario === "missing work id" ) delete fixture.Main.overview._overview.controls.appDisplay._redisplayWorkId
        if ( scenario === "missing session" ) fixture.Me.session = null
        assert.equal( fixture.wrapper.call( fixture.actor, "value" ), "redisplayed" )
        assert.equal( fixture.calls[0].actor, fixture.actor )
        assert.equal( fixture.calls[0].args[0], "value" )
        assert.equal( fixture.queued.length, 0 )
    } )
}

function favoritesFixture() {
    const session = {}
    const writes = []
    const errors = []
    let ids = ["first.desktop", "second.desktop"]
    let fail = false
    const settings = {
        get_strv() { return ids.slice() },
        set_strv( key, values ) {
            assert.equal( key, "favorite-apps" )
            assert.equal( session.favoritesSet, true )
            if ( fail ) throw new Error( "write failed" )
            writes.push( values )
            ids = values
        },
    }
    const Manager = loadClass( "sessionManager.js", "SessionManager", {
        global: { settings }, dev: { log( error ) { errors.push( error ) } },
    } )
    return {
        session, writes, errors,
        set( values ) { Manager.prototype.setFavorites.call( session, values.map( name => ( { name } ) ) ) },
        fail() { fail = true },
    }
}

test( "identical ordered favorites do not rewrite settings", () => {
    const fixture = favoritesFixture()
    fixture.set( ["first.desktop", "second.desktop"] )
    assert.equal( fixture.writes.length, 0 )
} )

test( "reordered favorites are written immediately and reset the scoped flag", () => {
    const fixture = favoritesFixture()
    fixture.set( ["second.desktop", "first.desktop"] )
    assert.deepEqual( fixture.writes, [["second.desktop", "first.desktop"]] )
    assert.equal( fixture.session.favoritesSet, false )
} )

test( "clearing favorites writes an empty list", () => {
    const fixture = favoritesFixture()
    fixture.set( [] )
    assert.equal( fixture.writes.length, 1 )
    assert.equal( fixture.writes[0].length, 0 )
    assert.equal( fixture.session.favoritesSet, false )
} )

test( "failed writes cannot leave favoritesSet active", () => {
    const fixture = favoritesFixture()
    fixture.fail()
    fixture.set( ["third.desktop"] )
    assert.equal( fixture.session.favoritesSet, false )
    assert.equal( fixture.errors.length, 1 )
} )
