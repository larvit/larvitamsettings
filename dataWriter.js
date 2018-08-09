'use strict';

const topLogPrefix = 'larvitamsettings: dataWriter.js - ',
	EventEmitter	= require('events').EventEmitter,
	DbMigration	= require('larvitdbmigration'),
	amsync	= require('larvitamsync'),
	async	= require('async');

function DataWriter(options, cb) {
	const	that	= this;

	that.readyInProgress	= false;
	that.isReady	= false;

	for (const key of Object.keys(options)) {
		that[key]	= options[key];
	}

	that.emitter	= new EventEmitter();

	that.listenToQueue(cb);
}

DataWriter.prototype.listenToQueue = function (retries, cb) {
	const	logPrefix	= topLogPrefix + 'listenToQueue() - ',
		that	= this,
		options	= {'exchange': that.exchangeName},
		tasks	= [];

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (retries === undefined) {
		retries = 0;
	}

	tasks.push(function (cb) {
		if (that.mode === 'master') {
			listenMethod	= 'consume';
			options.exclusive	= true;	// It is important no other client tries to sneak
			//		// out messages from us, and we want "consume"
			//		// since we want the queue to persist even if this
			//		// minion goes offline.
		} else if (that.mode === 'slave' || that.mode === 'noSync') {
			listenMethod = 'subscribe';
		} else {
			const	err	= new Error('Invalid mode. Must be either "master", "slave" or "noSync"');
			that.log.error(logPrefix + err.message);
			throw err;
		}

		that.log.info(logPrefix + 'listenMethod: ' + listenMethod);

		cb();
	});

	tasks.push(function (cb) {
		that.intercom[listenMethod](options, function (message, ack, deliveryTag) {
			that.ready(function (err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					that.log.error(logPrefix + 'intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					that.log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof that[message.action] === 'function') {
					that[message.action](message.params, deliveryTag, message.uuid);
				} else {
					that.log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			});
		}, cb);
	});

	// Make sure ready is ran
	tasks.push(function (cb) { that.ready(cb); });

	async.series(tasks, cb);
};

DataWriter.prototype.ready = function ready(retries, cb) {
	const	logPrefix	= topLogPrefix + 'ready() - ',
		tasks	= [],
		that	= this;

	that.log.silly(logPrefix + 'Running');

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (that.isReady === true) {
		that.log.silly(logPrefix + 'isReady === true');
		return cb();
	}

	if (that.readyInProgress === true) {
		that.log.debug(logPrefix + 'readyInProgress === true');
		that.eventEmitter.on('ready', cb);
		return;
	}

	that.readyInProgress = true;

	tasks.push(function (cb) {
		that.log.debug(logPrefix + 'Waiting for intercom.ready()');
		that.intercom.ready(cb);
	});

	tasks.push(function (cb) {
		if (that.mode === 'both' || that.mode === 'slave') {
			that.log.verbose(logPrefix + 'exports.mode: "' + that.mode + '", so read');

			new amsync.SyncClient({
				'intercom': that.intercom,
				'exchange': that.exchangeName + '_dataDump'
			}, cb);
		} else {
			cb();
		}
	});

	// Migrate database
	tasks.push(function (cb) {
		const	options	= {};

		let	dbMigration;

		that.log.debug(logPrefix + 'Waiting for dbmigration()');

		options.dbType	= 'larvitdb';
		options.dbDriver	= that.db;
		options.tableName	= 'setting_db_version';
		options.migrationScriptsPath	= __dirname + '/dbmigration';
		options.log	= that.log;
		dbMigration	= new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				that.log.error(logPrefix + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) {
			that.log.error(logPrefix + 'err: ' + err.message);
			return;
		}

		that.isReady	= true;
		that.emitter.emit('ready');

		if (that.mode === 'both' || that.mode === 'master') {
			that.log.debug(logPrefix + 'Starting dump server');
			that.runDumpServer(cb);
		} else {
			that.log.debug(logPrefix + 'NOT running dump server');
			cb();
		}
	});
};

DataWriter.prototype.runDumpServer = function runDumpServer(cb) {
	const	that = this,
		options	= {
			'exchange':	that.exchangeName + '_dataDump',
			'host':	that.amsync ? that.amsync.host : null,
			'minPort':	that.amsync ? that.amsync.minPort : null,
			'maxPort':	that.amsync ? that.amsync.maxPort : null
		},
		args	= [];

	if (that.db.conf.host) {
		args.push('-h');
		args.push(that.db.conf.host);
	}

	args.push('-u');
	args.push(that.db.conf.user);

	if (that.db.conf.password) {
		args.push('-p' + that.db.conf.password);
	}

	args.push('--single-transaction');
	args.push('--hex-blob');
	args.push(that.db.conf.database);

	// Tables
	args.push('settings');
	args.push('setting_db_version');

	options.dataDumpCmd = {
		'command':	'mysqldump',
		'args':	args
	};

	options['Content-Type']	= 'application/sql';
	options.intercom	= that.intercom;

	new amsync.SyncServer(options, cb);
};

DataWriter.prototype.writeToDb = function writeToDb(params, deliveryTag, msgUuid) {
	const that = this;

	that.db.query('REPLACE INTO settings VALUES(?,?);', [params.name, params.value], function (err) {
		that.emitter.emit(msgUuid, err);
	});
};

exports = module.exports = DataWriter;