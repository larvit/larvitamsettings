'use strict';

const	topLogPrefix	= 'larvitamsettings: index.js: ',
	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	DbMigration	= require('larvitdbmigration'),
	Intercom	= require('larvitamintercom'),
	checkKey	= require('check-object-key'),
	amsync	= require('larvitamsync'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false;

function listenToQueue(retries, cb) {
	const	logPrefix	= topLogPrefix + 'listenToQueue() - ',
		options	= {'exchange': exports.exchangeName},
		tasks	= [];

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (retries === undefined) {
		retries = 0;
	}

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'mode',
			'validValues':	['master', 'slave', 'noSync'],
			'default':	'noSync'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'intercom',
			'default':	new Intercom('loopback interface'),
			'defaultLabel':	'loopback interface'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		if (exports.mode === 'master') {
			listenMethod	= 'consume';
			options.exclusive	= true;	// It is important no other client tries to sneak
			//		// out messages from us, and we want "consume"
			//		// since we want the queue to persist even if this
			//		// minion goes offline.
		} else if (exports.mode === 'slave' || exports.mode === 'noSync') {
			listenMethod = 'subscribe';
		} else {
			const	err	= new Error('Invalid exports.mode. Must be either "master", "slave" or "noSync"');
			log.error(logPrefix + err.message);
			throw err;
		}

		log.info(logPrefix + 'listenMethod: ' + listenMethod);

		cb();
	});

	tasks.push(function (cb) {
		exports.intercom[listenMethod](options, function (message, ack, deliveryTag) {
			exports.ready(function (err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof exports[message.action] === 'function') {
					exports[message.action](message.params, deliveryTag, message.uuid);
				} else {
					log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			});
		}, cb);
	});

	// Make sure ready is ran
	tasks.push(ready);

	async.series(tasks, cb);
}
// Run listenToQueue as soon as all I/O is done, this makes sure the exports.mode can be set
// by the application before listening commences
setImmediate(listenToQueue);

// This is ran before each incoming message on the queue is handeled
function ready(cb) {
	const	logPrefix	= topLogPrefix + 'ready() - ',
		tasks	= [];

	log.silly(logPrefix + 'Running');

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (isReady === true) {
		log.silly(logPrefix + 'isReady === true');
		return cb();
	}

	if (readyInProgress === true) {
		log.debug(logPrefix + 'readyInProgress === true');
		eventEmitter.on('ready', cb);
		return;
	}

	readyInProgress = true;

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'mode',
			'validValues':	['master', 'slave', 'noSync'],
			'default':	'noSync'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		checkKey({
			'obj':	exports,
			'objectKey':	'intercom',
			'default':	new Intercom('loopback interface'),
			'defaultLabel':	'loopback interface'
		}, function (err, warning) {
			if (warning) log.warn(logPrefix + warning);
			cb(err);
		});
	});

	tasks.push(function (cb) {
		log.debug(logPrefix + 'Waiting for intercom.ready()');
		exports.intercom.ready(cb);
	});

	if (exports.mode === 'both' || exports.mode === 'slave') {
		log.verbose(logPrefix + 'exports.mode: "' + exports.mode + '", so read');

		tasks.push(function (cb) {
			amsync.mariadb({
				'exchange':	exports.exchangeName + '_dataDump',
				'intercom':	exports.intercom
			}, cb);
		});
	}

	// Migrate database
	tasks.push(function (cb) {
		const	options	= {};

		let	dbMigration;

		log.debug(logPrefix + 'Waiting for dbmigration()');

		options.dbType	= 'larvitdb';
		options.dbDriver	= db;
		options.tableName	= 'setting_db_version';
		options.migrationScriptsPath	= __dirname + '/dbmigration';
		dbMigration	= new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				log.error(logPrefix + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) {
			log.error(logPrefix + 'err: ' + err.message);
			return;
		}

		isReady	= true;
		eventEmitter.emit('ready');

		if (exports.mode === 'both' || exports.mode === 'master') {
			log.debug(logPrefix + 'Starting dump server');
			runDumpServer(cb);
		} else {
			log.debug(logPrefix + 'NOT running dump server');
			cb();
		}
	});
}

function runDumpServer(cb) {
	const	options	= {'exchange': exports.exchangeName + '_dataDump'},
		args	= [];

	if (db.conf.host) {
		args.push('-h');
		args.push(db.conf.host);
	}

	args.push('-u');
	args.push(db.conf.user);

	if (db.conf.password) {
		args.push('-p' + db.conf.password);
	}

	args.push('--single-transaction');
	args.push('--hex-blob');
	args.push(db.conf.database);

	// Tables
	args.push('settings');
	args.push('setting_db_version');

	options.dataDumpCmd = {
		'command':	'mysqldump',
		'args':	args
	};

	options['Content-Type']	= 'application/sql';
	options.intercom	= exports.intercom;

	new amsync.SyncServer(options, cb);
}

function get(settingName, cb) {
	ready(function (err) {
		if (err) return cb(err);

		db.query('SELECT content FROM settings WHERE name = ?', [settingName], function (err, rows) {
			if (err) return cb(err);

			if (rows.length === 0) {
				return cb(null, null);
			}

			cb(null, rows[0].content);
		});
	});
}

function set(settingName, settingValue, cb) {
	if (typeof cb !== 'function') {
		cb = function () {};
	}

	ready(function (err) {
		const	options	= {'exchange': exports.exchangeName},
			message	= {};

		if (err) return cb(err);

		message.action	= 'writeToDb';
		message.params	= {};
		message.params.name	= settingName;
		message.params.value	= settingValue;

		exports.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);

			exports.emitter.once(msgUuid, cb);
		});
	});
}

function writeToDb(params, deliveryTag, msgUuid) {
	const	logPrefix	= topLogPrefix + 'writeToDb() - ';

	get(params.name, function (err, prevValue) {
		if (err) return exports.emitter.emit(msgUuid, err);

		if (prevValue === params.value) {
			log.debug(logPrefix + 'source value is the same as target value, do not write to db');
			return exports.emitter.emit(msgUuid, err);
		}

		db.query('REPLACE INTO settings VALUES(?,?);', [params.name, params.value], function (err) {
			exports.emitter.emit(msgUuid, err);
		});
	});
}

exports.emitter	= new EventEmitter();
exports.exchangeName	= 'larvitamsettings';
exports.get	= get;
exports.listenToQueue	= listenToQueue;
exports.mode	= 'notSet'; // "slave" or "master"
exports.ready	= ready;
exports.set	= set;
exports.writeToDb	= writeToDb;
