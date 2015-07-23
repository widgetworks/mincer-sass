/**
 * Import our alternative SASS processor.
 */
var SassEngine = require('./lib/sass_engine');

module.exports = {
	SassEngine: SassEngine,
	
	/**
	 * Register the custom SassEngine (with the
	 * default 'sass' and 'scss' extensions)
	 * on the given Mincer *class* (not instance).
	 */
	registerWith: function(Mincer){
		Mincer.registerEngine('.sass', SassEngine);
		Mincer.registerEngine('.scss', SassEngine);
	}
};
