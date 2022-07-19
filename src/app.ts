import fs from 'fs';
import path from 'path';

import Fastify from 'fastify';
import pointOfView from '@fastify/view';
import formBodyPlugin from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import LoggerOptions from 'pino';

import routes from './routes';
import Sheets from './controllers/sheets';
import Calendar from './controllers/calendar';
import Messages from './controllers/messages';
import Voice from './controllers/voice';

export interface Config {
	server: {
		port: number;
		host: string;
		url: string;
	};
	logger: boolean | LoggerOptions.LoggerOptions;
	google: SheetsConfig;
	twilio: TwilioConfig;
	calendar: CalendarConfig;
}

export interface SheetsConfig {
	spreadsheetId: string;
	credentials: string;
	webhookSecret: string;
}

export interface TwilioConfig {
	accountSid: string;
	authToken: string;
	phone: string;
	serverUrl: string;
}

export interface CalendarConfig {
	timezone: string;
	latitude: number;
	longitude: number;
}

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

export async function init() {
	Sheets.configure(config.google);
	Messages.configure(config.twilio);
	Voice.configure(config.twilio);
	Calendar.configure(config.calendar);
	let sheets = await Sheets.getInstance();
	await sheets.setup();
	let calendar = await Calendar.getInstance();
	await calendar.setup();
}

export default app;
