'use strict';

const Settings = require(__dirname + '/../index.js');
const assert = require('assert');
const { Log } = require('larvitutils');
const log = new Log('warning');
const Db = require('larvitdb');

let options;
let settings;
let db;

before(async function () {
	this.timeout(10000);

	// Run DB Setup
	let confFile;

	if (process.env.DBCONFFILE === undefined) {
		confFile = __dirname + '/../config/db_test.json';
	} else {
		confFile = __dirname + '/../config/' + process.env.DBCONFFILE;
	}

	log.verbose('DB config file: "' + confFile + '"');
	log.verbose('DB config: ' + JSON.stringify(require(confFile)));

	const conf = require(confFile);
	conf.log = log;

	db = new Db(conf);
	await db.connect();
	await db.ready();

	// Check for empty db
	const rows = await db.query('SHOW TABLES');
	if (rows.length) {
		throw new Error('Database is not empty. To make a test, you must supply an empty database!');
	}

	// Create settings
	options = {
		log: log,
		db: db
	};

	settings = new Settings(options);

	await settings.runDbMigrations();
});

describe('Settings', function () {
	const setting1Name = 'fasdfdggg';
	const setting1Value = '3299efkadf';
	const setting2Name = 'obiobkbks';
	const setting2Value = '999f2ekfdfdd';
	const setting2Value2 = 'blirk';

	it('should set a setting', async function () {
		await settings.set(setting1Name, setting1Value);

		const {rows} = await db.query('SELECT content FROM settings');
		assert.deepEqual(rows.length, 1);
		assert.deepEqual(rows[0].content, setting1Value);
	});

	it('should set a second setting', async function () {
		await settings.set(setting2Name, setting2Value);

		const {rows} = await db.query('SELECT * FROM settings');

		let hits = 0;

		assert.deepEqual(rows.length, 2);

		for (let i = 0; rows[i] !== undefined; i++) {
			if (rows[i].name === setting2Name) {
				hits++;
				assert.deepEqual(rows[i].content, setting2Value);
			} else {
				assert.deepEqual(rows[i].name, setting1Name);
				assert.deepEqual(rows[i].content, setting1Value);
			}
		}

		assert.deepEqual(hits, 1);
	});

	it('should get settings', async function () {
		const result1 = await settings.get(setting1Name);
		assert.deepEqual(result1, setting1Value);

		const result2 = await settings.get(setting2Name);
		assert.deepEqual(result2, setting2Value);
	});

	it('should reset the second setting without change', async function () {
		await settings.set(setting2Name, setting2Value);

		const {rows} = await db.query('SELECT * FROM settings');

		let hits = 0;
		assert.deepEqual(rows.length, 2);

		for (let i = 0; rows[i] !== undefined; i++) {
			if (rows[i].name === setting2Name) {
				hits++;
				assert.deepEqual(rows[i].content, setting2Value);
			} else {
				assert.deepEqual(rows[i].name, setting1Name);
				assert.deepEqual(rows[i].content, setting1Value);
			}
		}

		assert.deepEqual(hits, 1);
	});

	it('should reset the second setting WITH change', async function () {
		await settings.set(setting2Name, setting2Value2);

		const {rows} = await db.query('SELECT * FROM settings');

		let hits = 0;

		assert.deepEqual(rows.length, 2);

		for (let i = 0; rows[i] !== undefined; i++) {
			if (rows[i].name === setting2Name) {
				hits++;
				assert.deepEqual(rows[i].content, setting2Value2);
			} else {
				assert.deepEqual(rows[i].name, setting1Name);
				assert.deepEqual(rows[i].content, setting1Value);
			}
		}

		assert.deepEqual(hits, 1);
	});
});

after(async function () {
	await db.removeAllTables();
});
