// 3rd-party
var slash = require('slash');


// Module definition
module.exports = SassTree;


/**
 * Keep track of sass import order.
 */
function SassTree(){
	this._pathMap = {};
	this._root = '';
	
	// Allow us to trim a string/set of chars
	// from the start of each path.
	this._slicePrefix = 0;
}
SassTree.prototype = {
	
	slicePrefix: function(prefix){
		// Should be a number.
		// TODO: Support substring.
		this._slicePrefix = prefix;
	},
	
	getRoot: function(){
		return this._root;
	},
	
	getMap: function(){
		return this._pathMap;
	},
	
	
	/**
	 * Return a list of path keys.
	 */
	pathList: function(){
		return Object.keys(this._pathMap);
	},
	
	
	/**
	 * Return true if the path exists.
	 * 
	 * @return {Boolean} [description]
	 */
	hasPath: function(path){
		return !!this._pathMap[path];
	},
	
	
	/**
	 * Add a path to our map.
	 */
	addPath: function(path, parentPath, lookupPath){
		
		// If the parent doesn't exist then add it as the root.
		if (!this.hasPath(parentPath)){
			this._root = parentPath;
		}
		
		return addPath_debug(path, parentPath, lookupPath, this._pathMap);
	},
	
	
	/**
	 * Return the item associated with 
	 * the given path.
	 * 
	 * @return {[type]} [description]
	 */
	getPath: function(path){
		return this._pathMap[path];
	},
	
	
	/**
	 * Generate a new map of paths from a leaf
	 * path to the root.
	 * 
	 * The results will be added to the given
	 * `destTree` instance.
	 * 
	 * @param  {string} path	 [description]
	 * @param  {SassTree} destTree The tree that will have nodes created on it.
	 * @return {SassTree}		  Returns the given `destTree` instance.
	 */
	fromLeaf: function(path, destTree){
		return buildTree_debug(path, destTree, this);
	},
	
	
	/**
	 * Return a list of nodes that can be 
	 * printed as an 'archy' tree.
	 * 
	 * @return {[type]} [description]
	 */
	toArchy: function(rootPath){
		var slicePrefix = this._slicePrefix;
		
		if (!rootPath){
			rootPath = this.getRoot();
		}
		
		// TODO: Add circular-dependency protection...
		function getItem(path, map){
			var pathItem = map[path] || {};
			
			return {
			  /**
			   * TODO: Truncate this to the last 'n' 
			   * characters of the path.
			   * 
			   * For testing we will trim the first 68 chars instead.
			   */
			  label: path.substring(slicePrefix),
			  nodes: pathItem.children.map(function(childPath){
				// Get the paths for those items too.
				return getItem(childPath, map);
			  })
			};
		}
		
		// Return the processed list.
		return getItem(rootPath, this._pathMap);
	}
};



/**
 * Keep track of files as they are resolved 
 * using Mincer.
 * 
 * @param {string} path	   The resolved path.
 * @param {string} parentPath The parent path that included this file.
 * @param {string} lookupPath (Optional) The original lookup in parent that resolved to `path`.
 */
function addPath_debug(path, parentPath, lookupPath, pathMap){
  
  if (!path){
	console.log(chalk.red('Trying to add invalid path: %s\n%s'), path, parentPath);
	return;
  }
  
  
  if (!path){
	console.log(chalk.red('Adding invalid path: %s\n%s'), path, parentPath);
	console.log('\n\n');
	
	// Make empty string for debugging purposes.
	path = '';
  }
  
  // Check if the item already exists.
  var pathItem = pathMap[path];
  
  
  /**
   * DEBUG - Print message if already listed.
   */
  // if (pathItem){
  //   console.log(chalk.red('\nAdding duplicate path\nPath: %s\nParent: %s\nLookup: %s'),
  //	 path.substring(debugSlice),
  //	 (parentPath || '').substring(debugSlice),
  //	 lookupPath
  //   );
	
  //   if (pathItem.path.indexOf('mixin') > 0){
  //	 console.log(chalk.green(JSON.stringify(pathItem, null, '  ')));
  //   }
  // }
  /**
   * END OF DEBUG.
   */
  
  
  // Add this path to the map.
  if (!pathItem){
	pathItem = pathMap[path] = {
	  path: path,
	  parentPath: parentPath,
	  lookupPath: lookupPath || '',
	  children: []
	};
  }
  
  // Make sure our parent exists.
  if (!pathMap[parentPath]){
	pathMap[parentPath] = {
	  path: parentPath,
	  parentPath: '',
	  lookupPath: '',
	  children: []
	};
  }
  
  // Add to our parent.
  pathMap[parentPath].children.push(path);
  
  
  return pathItem;
}


/**
 * Build a tree in reverse.
 * 
 * Start at a particular path and include
 * only the items between it and the root.
 */
function buildTree_debug(path, destTree, pathMap){
  
  // function getItem(sourcePathItem, map){
  //   map[sourcePathItem.path] = {
  //	   path: sourcePathItem.path,
  //	   parentPath: sourcePathItem.parentPath,
  //	   lookupPath: sourcePathItem.lookupPath,
  //	   children: []
  //	 };
	
  //   return map[sourcePathItem.path];
  // }

  
  /**
   * Build up the list of paths from root to leaf.
   */
  var pathList = [];
  var item = pathMap.getPath(path);
  while (item){
	pathList.unshift(item.path);
	
	if (item.parentPath){
	  item = pathMap.getPath(item.parentPath);
	} else {
	  item = null;
	}
  }
  
  
  /**
   * Make sure that tree of nodes exists.
   * 
   * When a path is created add it to its parent.
   */
  var prev;
  pathList.forEach(function(path){
	if (prev && !destTree.hasPath(path)){
		destTree.addPath(path, prev, '');
	}
	prev = path;
  });
  
  
  return destTree;
}
