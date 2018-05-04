[![Build Status](https://travis-ci.org/larvit/larvitamsettings.svg?branch=master)](https://travis-ci.org/larvit/larvitamsettings) [![Dependencies](https://david-dm.org/larvit/larvitamsettings.svg)](https://david-dm.org/larvit/larvitamsettings.svg)

# larvitamsettings

Share settings between microservices. Database driven, shared using RabbitMQ with larvitamintercom

## Installation

```bash
npm i --save larvitamsettings
```

## Usage

Setting name is limited to 100 characters ASCII
Setting value is limited to ~65MB UTF-8

```javascript
const	settings	= require('larvitamsettings');

settings.mode = 'master'; // Will make this instance the master of data, all other connected instances should be "slave" (default)
settings.intercom = new require('larvitamintercom')('loopback interface');
settings.amsync = {'host': null, 'minPort': null, 'maxPort': null};

settings.set('setting name', 'setting value - woho', function (err) {
	if (err) throw err;

	settings.get('setting_name', function (err, settingValue) {
		if (err) throw err;

		console.log(settingValue); // "setting value - woho"
	});
});
```
