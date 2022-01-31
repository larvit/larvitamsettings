'use strict';

const { DbMigration } = require('larvitdbmigration');
const { Log } = require('larvitutils');

const topLogPrefix = 'larvitamsettings: index.js: ';

class Settings {

	/**
	 * Constructor
	 *
	 * @param {object} options - Constructor options
	 * @param {object} options.db - Database instance
	 * @param {object} [options.log] - Logging instance
	 */
	constructor(options) {
		const logPrefix = topLogPrefix + 'Settings() - ';

		this.options = options || {};

		if (!this.options.log) {
			this.options.log = new Log();
		}
		this.log = this.options.log;

		if (!this.options.db) {
			const err = new Error('Required option "db" is missing');

			this.log.error(logPrefix + err.message);
			throw err;
		}

		for (const key of Object.keys(this.options)) {
			this[key] = this.options[key];
		}
	};

	/**
	 * Get a setting
	 * @param {string} settingName - Name of the setting
	 * @return {promise} - Resolves with a result
	 */
	async get(settingName) {
		const logPrefix = topLogPrefix + 'get() - ';
		const result = await this.db.query('SELECT content FROM settings WHERE name = ?', [settingName]);

		this.log.debug(logPrefix + 'Getting setting: ' + settingName);

		return (result.rows.length !== 0) ? result.rows[0].content : null;
	}

	/**
	 * Set a setting
	 * @param {string} settingName - Name of the setting
	 * @param {string} settingValue - Value of the setting
	 * @return {promise} - Resolves when settings is set
	 */
	async set(settingName, settingValue) {
		const logPrefix = topLogPrefix + 'set() - ';

		this.log.debug(logPrefix + 'Setting setting: ' + settingName + ', with value: ' + settingValue);

		await this.db.query('REPLACE INTO settings VALUES(?,?);', [settingName, settingValue]);
	}

	/**
	 * Run database migrations for the library
	 *
	 * @return {promise} - Resolves when database migrations are done
	 */
	async runDbMigrations() {
		const logPrefix = topLogPrefix + 'runDbMigrations() - ';
		this.log.info(logPrefix + 'Running DB migrations');

		const options = {};

		options.dbType = 'mariadb';
		options.dbDriver = this.db;
		options.tableName = 'setting_db_version';
		options.migrationScriptsPath = __dirname + '/dbmigration';
		options.log = this.log;

		const dbMigration = new DbMigration(options);

		await dbMigration.run();
	}
}

exports = module.exports = Settings;
