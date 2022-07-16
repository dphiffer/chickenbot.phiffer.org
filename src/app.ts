import fs from 'fs';
import path from 'path';

import Fastify from 'fastify';
import pointOfView from '@fastify/view';
import formBodyPlugin from '@fastify/formbody';
import fastifyStatic from '@fastify/static';

import routes from './routes';
import Sheets from './controllers/sheets';
import Calendar from './controllers/calendar';
import SMS from './controllers/sms';

import { setLogFunction } from './log';

const configPath = `${path.dirname(__dirname)}/config/config.json`;
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = Fastify({
	logger: config.logger,
});
app.register(formBodyPlugin);
app.register(pointOfView, {
	engine: {
		ejs: require('ejs'),
	},
	root: path.join(path.dirname(__dirname), 'views'),
	layout: 'layout.ejs',
	defaultContext: {
		url: config.url,
	},
});
app.register(fastifyStatic, {
	root: path.join(path.dirname(__dirname), 'public'),
});
app.register(routes);

setLogFunction(app.log.info);
Sheets.configure(config.google);
SMS.configure(config.twilio);
Calendar.configure(config.calendar);

(async () => {
	let sheets = await Sheets.getInstance();
	await sheets.setup();
	let calendar = await Calendar.getInstance();
	await calendar.setup();
})();

export default app;
