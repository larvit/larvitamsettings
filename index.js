'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	dbmigration	= require('larvitdbmigration')({'tableName': 'setting_db_version', 'migrationScriptsPath': __dirname + '/dbmigration'}),
	amsync	= require('larvitamsync'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false,
	intercom;

function listenToQueue(retries, cb) {
	const	options	= {'exchange': exports.exchangeName},
		tasks	= [];

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function(){};
	}

	if (retries === undefined) {
		retries = 0;
	}

	intercom	= require('larvitutils').instances.intercom;

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 10) {
		retries ++;
		setTimeout(function() {
			listenToQueue(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		log.error('larvitamsettings: index.js - listenToQueue() - Intercom is not set!');
		return;
	}

	if (exports.mode === 'master') {
		listenMethod	= 'consume';
		options.exclusive	= true;	// It is important no other client tries to sneak
				// out messages from us, and we want "consume"
				// since we want the queue to persist even if this
				// minion goes offline.
	} else if (exports.mode === 'slave' || exports.mode === 'noSync') {
		listenMethod = 'subscribe';
	} else {
		const	err	= new Error('larvitutils.instances.intercom is not an instance of Intercom!');
		log.error('larvitamsettings: index.js - listenToQueue() - ' + err.message);
		throw err;
	}

	log.info('larvitamsettings: index.js - listenToQueue() - listenMethod: ' + listenMethod);

	tasks.push(function(cb) {
		intercom.ready(cb);
	});

	tasks.push(function(cb) {
		intercom[listenMethod](options, function(message, ack, deliveryTag) {
			exports.ready(function(err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					log.error('larvitamsettings: index.js - listenToQueue() - intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					log.error('larvitamsettings: index.js - listenToQueue() - intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof exports[message.action] === 'function') {
					exports[message.action](message.params, deliveryTag, message.uuid);
				} else {
					log.warn('larvitamsettings: index.js - listenToQueue() - intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
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
function ready(retries, cb) {
	const	tasks	= [];

	log.silly('larvitamsettings: index.js - ready() - Running');

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function(){};
	}

	if (isReady === true) {
		log.silly('larvitamsettings: index.js - ready() - isReady === true');
		cb();
		return;
	}

	if (readyInProgress === true) {
		log.debug('larvitamsettings: index.js - ready() - readyInProgress === true');
		eventEmitter.on('ready', cb);
		return;
	}

	if (retries === undefined) {
		retries = 0;
	}

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 10) {
		log.debug('larvitamsettings: index.js - ready() - intercom is not an an instance of Intercom, retrying in 10ms');
		retries ++;
		setTimeout(function() {
			ready(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		const	err	= new Error('larvitutils.instances.intercom is not an instance of Intercom!');
		log.error('larvitamsettings: index.js - ready() - ' + err.message);
		throw err;
	}

	log.debug('larvitamsettings: index.js - ready() - intercom is an instance of Intercom, continuing.');

	readyInProgress = true;

	tasks.push(function(cb) {
		log.debug('larvitamsettings: index.js - ready() - Waiting for intercom.ready()');
		intercom.ready(cb);
	});

	if (exports.mode === 'both' || exports.mode === 'slave') {
		log.verbose('larvitamsettings: index.js: exports.mode: "' + exports.mode + '", so read');

		tasks.push(function(cb) {
			amsync.mariadb({'exchange': exports.exchangeName + '_dataDump'}, cb);
		});

	}

	if (exports.mode === 'noSync') {
		log.warn('larvitamsettings: index.js - exports.mode: "' + exports.mode + '", never run this mode in production!');
	}

	// Migrate database
	tasks.push(function(cb) {
		log.debug('larvitamsettings: index.js - ready() - Waiting for dbmigration()');
		dbmigration(function(err) {
			if (err) {
				log.error('larvitamsettings: index.js: Database error: ' + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function(err) {
		if (err) {
			log.error('larvitamsettings: index.js: ready() - err: ' + err.message);
			return;
		}

		isReady	= true;
		eventEmitter.emit('ready');

		if (exports.mode === 'both' || exports.mode === 'master') {
			log.debug('larvitamsettings: index.js - ready() - Starting dump server');
			runDumpServer(cb);
		} else {
			log.debug('larvitamsettings: index.js - ready() - NOT running dump server');
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

	options['Content-Type'] = 'application/sql';

	new amsync.SyncServer(options, cb);
}

function get(settingName, cb) {
	ready(function(err) {
		if (err) { cb(err); return; }

		db.query('SELECT content FROM settings WHERE name = ?', [settingName], function(err, rows) {
			if (err) { cb(err); return; }

			if (rows.length === 0) {
				cb(null, null);
				return;
			}

			cb(null, rows[0].content);
		});
	});
}

function set(settingName, settingValue, cb) {
	ready(function(err) {
		const	options	= {'exchange': exports.exchangeName},
			message	= {};

		if (err) { cb(err); return; }

		message.action	= 'writeToDb';
		message.params	= {};
		message.params.name	= settingName;
		message.params.value	= settingValue;

		intercom.send(message, options, function(err, msgUuid) {
			if (err) { cb(err); return; }

			exports.emitter.once(msgUuid, cb);
		});
	});
}

function writeToDb(params, deliveryTag, msgUuid) {
	db.query('REPLACE INTO settings VALUES(?,?);', [params.name, params.value], function(err) {
		exports.emitter.emit(msgUuid, err);
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
