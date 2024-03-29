[![Build Status](https://github.com/larvit/larvitamsettings/actions/workflows/ci.yml/badge.svg)](https://github.com/larvit/larvitamsettings/actions)

# larvitamsettings

Get and set settings from database. It is as simple as that!

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
	db: require('larvitdb'), // See https://github.com/larvit/larvitdb for configuration details

	// OPTIONAL
	log: new (new (require('larvitutils')())).Log() // Compatible with winston logging instance
});

await settings.set('setting name', 'setting value - woho');

const settingValue = await settings.get('setting_name');

console.log(settingValue); // "setting value - woho"

```
