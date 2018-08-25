[![Build Status](https://travis-ci.org/larvit/larvitamsettings.svg?branch=master)](https://travis-ci.org/larvit/larvitamsettings) [![Dependencies](https://david-dm.org/larvit/larvitamsettings.svg)](https://david-dm.org/larvit/larvitamsettings.svg)

# larvitamsettings

Share settings between microservices. Database driven, shared using RabbitMQ with larvitamintercom

## Installation

```bash
npm i larvitamsettings
```

## Usage

Setting name is limited to 100 characters ASCII
Setting value is limited to ~65MB UTF-8

```javascript
const Settings = require('larvitamsettings');

const settings = new Settings({
	'db': require('larvitdb'), // See https://github.com/larvit/larvitdb for configuration details

	// OPTIONAL
	'log':            new (new (require('larvitutils')())).Log(), // Compatible with winston logging instance
	'mode':           'noSync',                                   // Other options is "master" and "slave" that will sync settings between database instances over the intercom
	'intercom':       new require('larvitamintercom')('loopback interface'),
	'amsync_host':    null,
	'amsync_minPort': null,
	'amsync_maxPort': null
});

settings.set('setting name', 'setting value - woho', function (err) {
	if (err) throw err;

	settings.get('setting_name', function (err, settingValue) {
		if (err) throw err;

		console.log(settingValue); // "setting value - woho"
	});
});
```
