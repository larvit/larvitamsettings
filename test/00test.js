'use strict';

const Intercom = require('larvitamintercom');
const Settings = require(__dirname + '/../index.js');
const assert   = require('assert');
const LUtils   = require('larvitutils');
const lUtils   = new LUtils();
const async    = require('async');
const log      = new lUtils.Log('warning');
const db       = require('larvitdb');
const fs       = require('fs');

let options;
let settings;

before(function (done) {
	this.timeout(10000);

	const tasks = [];

	// Run DB Setup
	tasks.push(function (cb) {
		let confFile;

		if (process.env.DBCONFFILE === undefined) {
			confFile = __dirname + '/../config/db_test.json';
		} else {
			confFile = process.env.DBCONFFILE;
		}

		log.verbose('DB config file: "' + confFile + '"');

		// First look for absolute path
		fs.stat(confFile, function (err) {
			let conf;

			// If err, then look for this string in the config folder
			if (err) {
				confFile = __dirname + '/../config/' + confFile;
				fs.stat(confFile, function (err) {
					if (err) throw err;
					log.verbose('DB config: ' + JSON.stringify(require(confFile)));

					conf     = require(confFile);
					conf.log = log;
					db.setup(conf, cb);
				});

				return;
			}

			log.verbose('DB config: ' + JSON.stringify(require(confFile)));
			conf     = require(confFile);
			conf.log = log;
			db.setup(conf, cb);
		});
	});

	// Check for empty db
	tasks.push(function (cb) {
		db.query('SHOW TABLES', function (err, rows) {
			if (err) throw err;

			if (rows.length) {
				throw new Error('Database is not empty. To make a test, you must supply an empty database!');
			}

			cb();
		});
	});

	tasks.push(function (cb) {
		options = {
			'mode':     'master',
			'intercom': new Intercom('loopback interface'),
			'log':      log,
			'db':       db
		};

		settings = new Settings(options, cb);
	});

	async.series(tasks, done);
});

describe('Settings', function () {
	const setting1Name   = 'fasdfdggg';
	const setting1Value  = '3299efkadf';
	const setting2Name   = 'obiobkbks';
	const setting2Value  = '999f2ekfdfdd';
	const setting2Value2 = 'blirk';

	it('should set a setting', function (done) {
		settings.set(setting1Name, setting1Value, function (err) {
			if (err) throw err;

			db.query('SELECT content FROM settings', function (err, rows) {
				if (err) throw err;

				assert.deepEqual(rows.length,     1);
				assert.deepEqual(rows[0].content, setting1Value);

				done();
			});
		});
	});

	it('should set a second setting', function (done) {
		settings.set(setting2Name, setting2Value, function (err) {
			if (err) throw err;

			db.query('SELECT * FROM settings', function (err, rows) {
				let hits = 0;

				if (err) throw err;

				assert.deepEqual(rows.length, 2);

				for (let i = 0; rows[i] !== undefined; i ++) {
					if (rows[i].name === setting2Name) {
						hits ++;
						assert.deepEqual(rows[i].content, setting2Value);
					} else {
						assert.deepEqual(rows[i].name,    setting1Name);
						assert.deepEqual(rows[i].content, setting1Value);
					}
				}

				assert.deepEqual(hits, 1);

				done();
			});
		});
	});

	it('should get settings', function (done) {
		settings.get(setting1Name, function (err, result) {
			if (err) throw err;

			assert.deepEqual(result, setting1Value);

			settings.get(setting2Name, function (err, result) {
				if (err) throw err;

				assert.deepEqual(result, setting2Value);

				done();
			});
		});
	});

	it('should reset the second setting without change', function (done) {
		settings.set(setting2Name, setting2Value, function (err) {
			if (err) throw err;

			db.query('SELECT * FROM settings', function (err, rows) {
				let hits = 0;

				if (err) throw err;

				assert.deepEqual(rows.length, 2);

				for (let i = 0; rows[i] !== undefined; i ++) {
					if (rows[i].name === setting2Name) {
						hits ++;
						assert.deepEqual(rows[i].content, setting2Value);
					} else {
						assert.deepEqual(rows[i].name,    setting1Name);
						assert.deepEqual(rows[i].content, setting1Value);
					}
				}

				assert.deepEqual(hits, 1);

				done();
			});
		});
	});

	it('should reset the second setting WITH change', function (done) {
		settings.set(setting2Name, setting2Value2, function (err) {
			if (err) throw err;

			db.query('SELECT * FROM settings', function (err, rows) {
				let hits = 0;

				if (err) throw err;

				assert.deepEqual(rows.length, 2);

				for (let i = 0; rows[i] !== undefined; i ++) {
					if (rows[i].name === setting2Name) {
						hits ++;
						assert.deepEqual(rows[i].content, setting2Value2);
					} else {
						assert.deepEqual(rows[i].name,    setting1Name);
						assert.deepEqual(rows[i].content, setting1Value);
					}
				}

				assert.deepEqual(hits, 1);

				done();
			});
		});
	});
});

after(function (done) {
	db.removeAllTables(done);
});
