'use strict';

const	topLogPrefix	= 'larvitamsettings: index.js: ',
	DataWriter	= require(__dirname + '/dataWriter.js');

function Settings(options, cb) {
	const logPrefix = topLogPrefix + 'Settings() - ',
		that = this;

	that.options	= options || {};

	if ( ! that.options.db) {
		throw new Error('Required option db is missing');
	}
	that.db	= that.options.db;

	if ( ! that.options.log) {
		that.options.log	= new lUtils.Log();
	}

	if ( ! that.options.exchangeName) {
		that.options.exchangeName	= 'larvitamsettings';
	}

	if ( ! that.options.mode) {
		that.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
		that.options.mode	= 'noSync';
	} else if (['noSync', 'master', 'slave'].indexOf(that.options.mode) === - 1) {
		const	err	= new Error('Invalid "mode" option given: "' + that.options.mode + '"');
		that.log.error(logPrefix + err.message);
		throw err;
	}

	if ( ! that.options.intercom) {
		that.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
		that.options.intercom	= new Intercom('loopback interface');
	}

	that.dataWriter	= new DataWriter({
		'exchangeName':	that.options.exchangeName,
		'intercom':	that.options.intercom,
		'mode':	that.options.mode,
		'log':	that.options.log,
		'db':	that.db,
		'amsync_host':	that.options.amsync_host || null,
		'amsync_minPort':	that.options.amsync_minPort || null,
		'amsync_maxPort':	that.options.amsync_maxPort || null
	}, cb);
};

Settings.prototype.get = function get(settingName, cb) {
	const that = this;

	that.db.query('SELECT content FROM settings WHERE name = ?', [settingName], function (err, rows) {
		if (err) return cb(err);

		if (rows.length === 0) {
			return cb(null, null);
		}

		cb(null, rows[0].content);
	});
};

Settings.prototype.set = function set(settingName, settingValue, cb) {
	const that = this,
		logPrefix = topLogPrefix + 'set() - ';

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	that.get(settingName, function (err, prevValue) {
		const	options	= {'exchange': that.options.exchangeName},
			message	= {
				'action': 'writeToDb',
				'params': {
					'name': settingName,
					'value': settingValue
				}
			};	

		if (err) return cb(err);

		if (prevValue === settingValue) {
			that.options.log.debug(logPrefix + 'source value is the same as target value, do not write to db');
			return cb(err);
		}

		that.options.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);

			that.dataWriter.emitter.once(msgUuid, cb);
		});
	});
};

exports = module.exports = Settings;