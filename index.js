'use strict';

const topLogPrefix = 'larvitamsettings: index.js: ';
const DataWriter   = require(__dirname + '/dataWriter.js');
const Intercom     = require('larvitamintercom');
const LUtils       = require('larvitutils');

/**
 * Module main constructor
 *
 * @param {obj}  options - {db, log, exchangeName, mode, intercom, db, amsync_host, amsync_minPort, amsync_maxPort}
 * @param {func} cb      - callback(err)
 * @returns {obj}        - instance of this
 */
function Settings(options, cb) {
	const logPrefix = topLogPrefix + 'Settings() - ';
	const that = this;

	if (typeof options === 'function') {
		cb      = options;
		options = {};
	}

	if (! typeof cb === 'function') {
		cb = function () {};
	}

	that.options = options || {};

	if (! that.options.log) {
		const lUtils = new LUtils();

		that.options.log = new lUtils.Log();
	}
	that.log = that.options.log;

	if (! that.options.db) {
		const err = new Error('Required option "db" is missing');

		that.log.error(logPrefix + err.message);
		cb(err);

		return that;
	}

	if (! that.options.exchangeName) {
		that.options.exchangeName	= 'larvitamsettings';
	}

	if (! that.options.mode) {
		options.log.info(logPrefix + 'No "mode" option given, defaulting to "noSync"');
		that.options.mode = 'noSync';
	} else if (['noSync', 'master', 'slave'].indexOf(that.options.mode) === - 1) {
		const	err	= new Error('Invalid "mode" option given: "' + that.options.mode + '", must be one of "noSync", "master" or "slave"');

		that.log.error(logPrefix + err.message);
		cb(err);

		return that;
	}

	if (! that.options.intercom) {
		that.log.info(logPrefix + 'No "intercom" option given, defaulting to "loopback interface"');
		that.options.intercom = new Intercom('loopback interface');
	}

	for (const key of Object.keys(that.options)) {
		that[key] = that.options[key];
	}

	that.dataWriter	= new DataWriter({
		'exchangeName':   that.exchangeName,
		'intercom':       that.intercom,
		'mode':           that.mode,
		'log':            that.log,
		'db':             that.db,
		'amsync_host':    that.amsync_host || null,
		'amsync_minPort': that.amsync_minPort || null,
		'amsync_maxPort': that.amsync_maxPort || null
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
	const logPrefix = topLogPrefix + 'set() - ';
	const that      = this;

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	that.get(settingName, function (err, prevValue) {
		const options = {'exchange': that.exchangeName};
		const message = {
			'action': 'writeToDb',
			'params': {
				'name':  settingName,
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
