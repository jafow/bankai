var debug = require('debug')('bankai.node-script')
var concat = require('concat-stream')
var assert = require('assert')

var babelPresetEnv = require('babel-preset-env')
var cssExtract = require('css-extract')
var browserify = require('browserify')
var babelify = require('babelify')
var watchify = require('watchify')
var sheetify = require('sheetify')
var yoyoify = require('yo-yoify')
var tinyify = require('tinyify')
var glslify = require('glslify')
var brfs = require('brfs')

var ttyError = require('./tty-error')
var exorcise = require('./exorcise')

// Browsers to support in Babel.
var browsers = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%' // Cover all other browsers that are widely used.
]

module.exports = node

function node (state, createEdge) {
  assert.equal(typeof state.metadata.entry, 'string', 'state.metadata.entries should be type string')

  this.emit('progress', 'scripts', 0)

  var self = this
  var entry = state.metadata.entry
  var fullPaths = Boolean(state.metadata.fullPaths)
  var b = browserify(browserifyOpts([entry], fullPaths))

  if (state.metadata.watch) {
    b = watchify(b)
    debug('watching ' + entry)
    this.on('close', function () {
      debug('closing file watcher')
      b.close()
    })
  }

  b.ignore('sheetify/insert')
  b.transform(sheetify)
  b.transform(glslify)
  b.transform(babelify, {
    global: true,
    presets: [
      [babelPresetEnv, {
        targets: { browsers: browsers }
      }]
    ]
  })
  b.transform(brfs, { global: true })
  b.transform(yoyoify, { global: true })

  if (!fullPaths) b.plugin(cssExtract, { out: bundleStyles })
  if (!state.metadata.watch && !state.metadata.fullPaths) b.plugin(tinyify)

  bundleScripts()
  b.on('update', bundleScripts)

  function bundleScripts () {
    self.emit('progress', 'scripts', 30)

    b.bundle(function (err, bundle) {
      if (err) {
        delete err.stream
        err = ttyError('scripts', 'browserify.bundle', err)
        return self.emit('error', 'scripts', 'browserify.bundle', err)
      }
      var mapName = 'bundle.js.map'
      exorcise(bundle, mapName, function (err, bundle, map) {
        if (err) return self.emit('error', 'scripts', 'exorcise', err)
        createEdge(mapName, Buffer.from(map))
        createEdge('bundle', bundle)
        self.emit('progress', 'scripts', 100)
      })
    })
  }

  function bundleStyles () {
    return concat({ encoding: 'buffer' }, function (buf) {
      createEdge('style', buf)
    })
  }
}

function browserifyOpts (entries, fullPaths) {
  assert.ok(Array.isArray(entries), 'browserifyOpts: entries should be an array')
  return {
    debug: true,
    fullPaths: fullPaths,
    entries: entries,
    packageCache: {},
    cache: {}
  }
}
