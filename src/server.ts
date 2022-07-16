import fs from 'fs';
import path from 'path';
import { init } from './app';
import app from './app';

(async () => {
	await init();
	const configPath = `${path.dirname(__dirname)}/config/config.json`;
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	app.listen(config.server);
})();
