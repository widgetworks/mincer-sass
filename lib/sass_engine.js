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
var slash = require('slash');
var sass; // initialized later


// internal
var Template  = require('mincer/lib/mincer/template');
var prop      = require('mincer/lib/mincer/common').prop;
var logger    = require('mincer/lib/mincer/logger');


/**
 * Debug.
 * 
 * Build a tree of which file includes which other files.
 * 
 * NOTE: What happens if the same file is included twice?
 */
var SassTree = require('./sass_tree_debug');

// The number of characters to slice 
// off paths during debug.
var debugSlice = 68;
var debugMap = new SassTree();


/**
 * Use archy to print the tree of paths.
 * 
 * If `filterPath` is given then we will only
 * print the tree that includes that path.
 */
function printTree_debug(filterPath) {

  var pathMap;
  if (filterPath) {

    // Just print the items that match `filterPath`.

    // Find the paths that have a similar path
    // to the one with the error (i.e. contain the path).
    var matchingPaths = _.filter(debugMap.pathList(), function(path) {
      return slash(path).indexOf(filterPath) > 0;
    });

    // Produce a cut-down map of files that were involved
    // in the "@import" chain.
    var tempMap = _.reduce(matchingPaths, function(tempMap, path) {
      debugMap.fromLeaf(path, tempMap);

      return tempMap;
    }, new SassTree());
    tempMap.slicePrefix(debugSlice);

    // NOTE: Need a valid root item.
    // console.log(chalk.red('tempMap[root]='), tempMap[debugRoot]);

    // Convert into archy's required structure.
    pathMap = tempMap.toArchy();

  } else {
    // Print everything.
    // Start at the root and walk the tree.
    pathMap = debugMap.toArchy();
  }

  var tree = require('archy')(pathMap);
  console.log('Paths:\n');
  console.log(tree);
}
/**
 * End of debug.
 */



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
  
  /**
   * Format a nice error message with the 
   * entire set of sass information.
   */
  if (ctx.file){
    // TODO: Print out backtrace.
    return new Error(util.format('%s(%d,%d): %s\n\n', ctx.file, ctx.line, ctx.column, ctx.message));
  }
  
  
  // Prevent 
  var errMessage = ctx instanceof Error ? ctx.message : ctx;
  
  // libsass error string format: path:line: error: message
  var error = _.zipObject(
    [ 'path', 'line', 'level', 'message' ],
    errMessage.split(':', 4).map(function(str) { return str.trim(); })
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
      indentedSyntax: /^.*\.sass$/.test(this.file),
      
      // TODO: Add config option for this:
      sourceComments: true
    });

    this.data = String(result.css || result);
  } catch(err) {
    // 2015-07-10: Check for Error object first, instead of string.
    // if (err instanceof Error){
      // throw err;
    // } else {
      
      /**
       * Debug.
       * 
       * Print our our tree of files.
       */
      // // Print entire graph:
      // printTree_debug();
      
      console.log('\n\n');
      
      // Print (small) graph with error.
      printTree_debug(err.file);
      /**
       * End of debug.
       */
      
      
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
  
  
  /**
   * Logging.
   */
  // 2015-07-11: Coridyn
  // Debug path data.
  // var _pathData = {
  //   prev: prev,
  //   importPath: importPath,
  //   url: url
  // };
  // console.log(JSON.stringify(_pathData, null, '  '));
  /**
   * End of logging.
   */
  
  
  // Check if the path has globbing.
  // TODO: Process each file (e.g. ejs files).
  var content;
  if (GLOB.test(url)){
    content = importsFromGlob(context, url, prev);
  } else {
    content = importFromPath(context, url, prev);
  }
  
  // console.log('\n');
  // console.log('======================');
  // console.log('\n');
  
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
 * 
 * Find a single asset and return it's processed contents.
 * 
 * This generally occurs after the path has been resolved
 * from a glob.
 */
function importFromPath(context, assetPath, basePath){
  var result;
  // result ? = sass.NULL;
  
  // This is the one that needs to evaluate the individual files.
  // var baseDir = path.dirname(basePath);
  // var assetPath = path.join(baseDir, importPath);
  // var resolvedPath = resolve(context, assetPath, basePath);
  
  var resolvedPath = resolve(context, assetPath, basePath);
  
  
  /**
   * Debug.
   */
  if (!resolvedPath){
    // ERROR - print a useful error that we couldnt find `assetPath`
    // referenced from `basePath`.
    // throw new Error('Cannot find ');
    
    console.log(chalk.green('cannot find `assetPath`: %s\nRelative to `basePath`: %s'), assetPath, basePath);
  }
  debugMap.addPath(resolvedPath, basePath, assetPath);
  /**
   * End of debug.
   */
  
  
  if (resolvedPath){
    
    if (resolvedPath.indexOf('container-spacer') > 0 ){
      console.log('container-spacer');
      // console.log('%s: \n%s\n', chalk.red('container-spacer'), resolvedPath);
    }
    
    result = processAsset(context, resolvedPath);
    
    
    if (resolvedPath.indexOf('container-spacer') > 0 ){
      console.log('%s: \n%s\n', chalk.red('container-spacer'), result);
      // console.log('%s: \n%s\n', chalk.red('container-spacer'), resolvedPath);
    }
    
    
    if (resolvedPath.indexOf('shared-style') > 0 ){
      console.log('%s: \n%s\n', chalk.red('shared-style'), resolvedPath);
    }
    
    if (resolvedPath.indexOf('calc-body') > 0 ){
      console.log('%s: \n%s\n', chalk.red('calc-body'), resolvedPath);
    }
    
    // console.log('resolvedPath=%s\n', resolvedPath);
  }
  
  return {
    /**
     * 2015-07-24:
     * I think node-sass is including the files twice.
     * Once through it's own file handling and also
     * through our Mincer processing.
     * 
     * Don't include the `file` property here and see
     * if that fixes the problem.
     */
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

  /**
   * TRY KEEPING SASS IN THE LIST HERE...
   */
  // var processors = attributes.processors;
  
  
  /**
   * LOGGING.
   */
  // console.log(chalk.magenta('assetPath='), assetPath.substring(debugSlice));
  /**
   * End of logging
   */
  
  
  // DEBUGGING.
  var result;
  
  if (assetPath.indexOf('tabs') > 0){
    
    console.log('tabs: assetPath=', assetPath);
    result = require('fs').readFileSync(assetPath, {encoding: 'utf8'});
    
  } else {
    
    result = context.evaluate(assetPath, {
      processors: processors
    });
    
  }
  
  
  
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
    
    // console.log('importFromPath: result=', (''+result).substring(0, 20));
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
    
    // `resolve()` returns the path if we have an
    // absolute path - so keep track of that and
    // check if it is truthy..
    var filename = context.resolve(file, undefined, function(found){
      if (context.isAssetRequirable(found)){
        result = found;
        wasFound = true;
        return found;
      }
    });
    
    if (!!filename){
      result = filename;
    }
    
    return wasFound || !!filename;
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
  
  
  /**
   * Debug.
   */
  _.forEach(imports, function(path){
    debugMap.addPath(path, basePath, glob);
  });
  // console.log('importsFromGlob: imports=', imports);
  /**
   * End of debug.
   */
  
  
  var sassImports = imports.map(function(assetPath){
    // Register Mincer file dependency.
    context.dependOn(assetPath);
    
    // Get the asset path relative to `baseDir`.
    var relativePath = slash(path.relative(baseDir, assetPath));
    // console.log('relativePath=', relativePath);
    
    // Generate a SASS-style '@import' statement for each file.
    return '@import "'+relativePath+'";';
  });
  
  
  // /**
  //  * TODO: Look up relative paths immediately.
  //  */
  // var sassImports = imports.map(function(assetPath){
  //   context.dependOn(assetPath);
    
  //   // var relativePath = slash(path.relative(baseDir, assetPath));
    
  //   console.log('assetPath=', assetPath);
  //   var content = importFromPath(context, assetPath, basePath);
    
  //   console.log('data=', content.contents);
  //   return content.contents;
  // });
  
  var virtualFile = getUniqueFile(glob, basePath);
  
  // Skip if sassImports is empty.
  console.log('basePath=%s', basePath);
  console.log('virtualFile=%s', virtualFile);
  console.log('sassImports=\n%s\n', sassImports.join('\n'));
  
  return {
    // Set 'file' to the basePath so we get a valid
    // lookup location for relative glob resolutions.
    file: virtualFile,
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
  // console.log('resolveGlob: baseDir=', baseDir);
  
  // TODO: If `basePath` is not absolute then we need
  // to look it up in the context.
  
  var results = [];
  Glob.sync(
    glob,
    {
      cwd: baseDir,
      nodir: true   // Exclude directories.
    }
  ).forEach(function(assetPath){
      var joinedPath = path.join(baseDir, assetPath);
      
      var isValid = joinedPath != context.pathname && context.isAssetRequirable(joinedPath);
      
      // console.log('resolveGlob: isValid=', isValid, ', joinedPath=', joinedPath);
      
      if (isValid){
        results.push(joinedPath);
      }
    });
  return results;
}



/**
 * Create a unique filename that represents
 * a glob "file" (i.e. contains all of the 
 * resolved files for that glob).
 * 
 * This lets libsass treat each of these 
 * virtual files as it's own set of content.
 */
var counter = 0;
function getUniqueFile(glob, prev){
  
  var filename = glob.replace('/', '_');
  filename = ('[' + counter++ + ']') + '[' + filename + ']';
  
  
  // Replace slashes with _.
  var basePath = path.dirname(prev);
  
  // Joun and replace slashes.
  var file = slash(prev + '+' + filename);
  return file;
}
