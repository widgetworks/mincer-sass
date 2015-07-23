/**
 *  class SassEngine
 *
 *  Engine for the SASS/SCSS compiler. You will need `node-sass` Node module installed
 *  in order to use [[Mincer]] with `*.sass` or `*.scss` files:
 *
 *      npm install node-sass
 *
 *
 *  ##### SUBCLASS OF
 *
 *  [[Template]]
 **/


'use strict';

// stdlib
var path = require('path');
var util = require('util');

// 3rd-party
var _ = require('lodash');
var Glob = require('glob');
var chalk = require('chalk');
var sass; // initialized later


// internal
var Template  = require('mincer/lib/mincer/template');
var prop      = require('mincer/lib/mincer/common').prop;
var logger    = require('mincer/lib/mincer/logger');


////////////////////////////////////////////////////////////////////////////////


// Class constructor
var SassEngine = module.exports = function SassEngine() {
  Template.apply(this, arguments);
  sass = sass || Template.libs['node-sass'] || require('node-sass');

  // Ensure node sass module has renderSync method
  if (!sass.renderSync) {
    throw new Error('node-sass < v0.5 is not supported.');
  }
};


require('util').inherits(SassEngine, Template);


// helper to generate human-friendly errors.
// adapted version from less_engine.js
function sassError(ctx /*, options*/) {
  // libsass error string format: path:line: error: message
  var error = _.zipObject(
    [ 'path', 'line', 'level', 'message' ],
    ctx.split(':', 4).map(function(str) { return str.trim(); })
  );
  if (error.line && error.level && error.message) {
    return new Error('Line ' + error.line + ': ' + error.message);
  }

  return new Error(ctx);
}


// Render data
SassEngine.prototype.evaluate = function (context/*, locals*/) {
  var self = this;

  try {
    var result = sass.renderSync({
      file:         this.file,
      data:         this.data,
      importer:     function(url, prev) {
        return self.sassImporter(context, url, prev);
      },
      includePaths: [ path.dirname(this.file) ].concat(context.environment.paths),
      indentedSyntax: /^.*\.sass$/.test(this.file)
    });

    this.data = String(result.css || result);
  } catch(err) {
    // 2015-07-10: Check for Error object first, instead of string.
    // if (err instanceof Error){
    //   throw err;
    // } else {
      // Otherwise try to format the SASS error.
      var error = sassError(err);
      throw error;
    // }
  }
};


// Returns the argument of the @import() call relative to the asset search paths.
function importArgumentRelativeToSearchPaths(importer, importArgument, searchPaths) {
  var importAbsolutePath = path.resolve(path.dirname(importer), importArgument);
  var importSearchPath = _.find(searchPaths, function(path) {
    return importAbsolutePath.indexOf(path) === 0;
  });
  if (importSearchPath) {
    return path.relative(importSearchPath, importAbsolutePath);
  }
}


function isFileNotFound(error) {
  return error && error.code === 'FileNotFound';
}


function tryDepend(context, importPath) {
  if (importPath) {
    try {
      context.dependOn(importPath);
    } catch (error) {
      return error;
    }
  }
}


// Regexp to check for globs.
var GLOB = /\*|\[.+\]/

SassEngine.prototype.sassImporter = function (context, url, prev) {
  var importPath = importArgumentRelativeToSearchPaths(prev, url, context.environment.__trail__.paths);
  
  
  // 2015-07-11: Coridyn
  
  // Debug path data.
  var _pathData = {
    prev: prev,
    importPath: importPath,
    url: url
  };
  
  console.log(JSON.stringify(_pathData, null, '  '));
  
  
  // TODO: Check if the path has globbing.
  // TODO: Process each file (e.g. ejs files).
  var content;
  if (GLOB.test(url)){
    content = importsFromGlob(context, url, prev);
  } else {
    content = importFromPath(context, url, prev);
  }
  
  console.log('\n');
  console.log('======================');
  console.log('\n');
  
  if (content != null || content.contents == null){
    return content;
  } else {
    console.warn(chalk.red('content is null!'));
  }
    
  
  // // "If you have a SCSS or Sass file that you want to import but don't want to compile to a CSS file, you can add an
  // // underscore to the beginning of the filename. ... You can then import these files without using the underscore."
  // // https://github.com/sass/sass/blob/d26e6f/doc-src/SASS_REFERENCE.md#partials-partials
  // var underscoredImportPath = importPath && path.join(path.dirname(importPath), '_' + path.basename(importPath));

  // var firstError = tryDepend(context, importPath);
  // var secondError = isFileNotFound(firstError) && tryDepend(context, underscoredImportPath);

  // // While @import()ing assets outside of the search paths should be strongly discouraged, it is valid. Because the
  // // asset is outside of the search path, there's no way to call depend_on() on it, so we shouldn't throw an error.
  // if (isFileNotFound(firstError) && isFileNotFound(secondError)) {
  //   logger.warn(util.format('%s will not change when %s changes, because the file could not be found.', prev, url,
  //     firstError.message, secondError.message));
  // }

  // return {
  //   file: url
  // };
};

// Expose default MimeType of an engine
prop(SassEngine, 'defaultMimeType', 'text/css');


/**
 * 2015-07-11
 * 
 * Mincer path handling.
 */
function importFromPath(context, assetPath, basePath){
  var result;
  // result ? = sass.NULL;
  
  // This is the one that needs to evaluate the individual files.
  // var baseDir = path.dirname(basePath);
  // var assetPath = path.join(baseDir, importPath);
  // var resolvedPath = resolve(context, assetPath, basePath);
  
  var resolvedPath = resolve(context, assetPath, basePath);
  if (resolvedPath){
    result = processAsset(context, resolvedPath);
  }
  
  return {
    file: resolvedPath,
    contents: result
  };
}


// Read each file in without processing it with SASS.
function processAsset(context, assetPath){
  // Remove SASS from the processor list.
  var attributes = context.environment.attributesFor(assetPath);
  var processors = attributes.processors.filter(function(processor){
    return processor != SassEngine;
  });
  
  console.log(chalk.magenta('assetPath='), assetPath);
  
  var result = context.evaluate(assetPath, {
    processors: processors
  });
  
  // if (path.isAbsolute(assetPath)){
  //   // TODO: Make relative?
  //   result = null;
  // } else {
  //   result = ;
  // }
  
  /**
   * `result` has the following structure:
   * 
   * {
   *   data: '',
   *   map: ?
   * }
   * 
   * The `map` property might be the source map?
   */
  if (result){
    result = result.data;
    console.log('importFromPath: result=', (''+result).substring(0, 20));
  } else {
    console.log(chalk.red('importFromPath: result='), result);
  }
  return result;
}


/**
 * Finds an asset from the given path. This is
 * where we make Mincer behave like Sass and 
 * import partial style paths.
 * 
 * @param  {[type]} context   [description]
 * @param  {[type]} assetPath [description]
 * @param  {[type]} basePath  [description]
 * @return {[type]}           [description]
 */
function resolve(context, assetPath, basePath){
  var candidates = possibleFiles(context, assetPath, basePath);
  var result;
  
  _.some(candidates, function(file){
    var wasFound = false;
    
    context.resolve(file, undefined, function(found){
      if (context.isAssetRequirable(found)){
        result = found;
        wasFound = true;
        return found;
      }
    });
    
    return wasFound;
  });
  
  return result;
}


/**
 * Return a list of possible paths to 
 * try to resolve (including partial prefix).
 * 
 * 
 */
function possibleFiles(context, assetPath, basePath){
  basePath = path.dirname(basePath);
  var paths = [assetPath, partialisePath(assetPath)];
  
  // Find basePath's root
  var envRootPaths = context.environment.__trail__.paths;
  var rootPath = _.find(envRootPaths, function(envRootPath){
    return basePath.indexOf(envRootPath);
  });
  rootPath = rootPath || context.rootPath;
  
  // Add the relative path from the root, if necessary.
  var relativePath;
  if (!path.isAbsolute(assetPath) && basePath != rootPath){
    relativePath = path.join(path.relative(rootPath, basePath), assetPath);
    paths.unshift(relativePath, partialisePath(relativePath));
  }
  
  // Compact down the list to remove nulls.
  return paths.filter(function(path){
    return path != null;
  });
}


/**
 * Returns the underscore prefixed version
 * of the path or null if it's already a partial.
 * 
 * @return {[type]} [description]
 */
function partialisePath(assetPath){
  var partial = null;
  if (assetPath && path.basename(assetPath).charAt(0) != '_'){
    // partial = assetPath.replace(/([^\/]+)$/, '_$1');
    
    // NOTE: Need to normalise windows paths to unix-style
    // Add a regex check 
    partial = assetPath.replace(/([^\/\\]+)$/, '_$1');
  }
  return partial;
}


/**
 * Mincer glob handling.
 * 
 * @param  {[type]} context  [description]
 * @param  {[type]} glob     [description]
 * @param  {[type]} basePath [description]
 * @return {[type]}          [description]
 */
function importsFromGlob(context, glob, basePath){
  
  var baseDir = path.dirname(basePath);
  var imports = resolveGlob(context, glob, basePath);
  
  console.log('importsFromGlob: imports=', imports);
  
  var sassImports = imports.map(function(assetPath){
    // Register Mincer file dependency.
    context.dependOn(assetPath);
    
    // Get the asset path relative to `baseDir`.
    var relativePath = toUnixPath(path.relative(baseDir, assetPath));
    console.log('relativePath=', relativePath);
    
    // Generate a SASS-style '@import' statement for each file.
    return '@import "'+relativePath+'";';
  });
  
  // Skip if sassImports is empty.
  console.log('sassImports=', sassImports);
  
  return {
    // Set 'file' to the basePath so we get a valid
    // lookup location for relative glob resolutions.
    file: basePath,
    contents: sassImports.join('\n')
  };
}


/**
 * Return a list of fully-qualified paths for
 * each asset that matches the glob.
 * 
 * TODO: Check if this will resolve a glob like:
 *   '@import "asb-shared-lib/stylesheets/vars/*";'
 * 
 * At the moment I think this will try to resolve this glob as:
 * relative to the current base path:
 *   'asb-home-loans/stylesheets/asb-shared-lib/stylesheets/vars/*'
 * 
 * instead of as the Sprockets-style path:
 *   'asb-shared-lib/stylesheets/vars/*'
 * 
 * 
 * @param  {mincer/context} context  The Mincer processing context (holds helper methods, etc.)
 * @param  {string} glob      The SASS "@import" glob to resolve
 * @param  {string} basePath  The 
 * @return {string[]}         List of fully-qualified paths to requirable assets (i.e. ignoring directories).
 */
function resolveGlob(context, glob, basePath){
  var baseDir = path.dirname(basePath);
  
  // ERROR: Handle case where 'basePath' is not fully-qualified.
  // i.e. use Mincer to resolve it.
  console.log('resolveGlob: baseDir=', baseDir);
  
  // TODO: If `basePath` is not absolute then we need
  // to look it up in the context.
  
  var results = [];
  Glob.sync(glob, {
      cwd: baseDir
    })
    .forEach(function(assetPath){
      var joinedPath = path.join(baseDir, assetPath);
      
      var isValid = joinedPath != context.pathname && context.isAssetRequirable(joinedPath);
      
      console.log('resolveGlob: isValid=', isValid, ', joinedPath=', joinedPath);
      //console.log('resolveGlob: isValid=', isValid, ', joinedPath=', joinedPath);
      
      if (isValid){
        results.push(joinedPath);
      }
    });
  return results;
}


/**
 * Make sure the returned path has unix-style slashes.
 */
function toUnixPath(_path){
  var result = _path;
  if (_path){
    result = _path.replace(/\\/g, '/');
  }
  return result;
}