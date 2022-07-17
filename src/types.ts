import LoggerOptions from 'pino';

export interface Config {
	server: {
		port: number;
		host: string;
		url: string;
	};
	logger: boolean | LoggerOptions.LoggerOptions;
	google: SheetsConfig;
	twilio: SMSConfig;
	calendar: CalendarConfig;
}

export interface SheetsConfig {
	spreadsheetId: string;
	credentials: string;
	webhookSecret: string;
}

export interface SMSConfig {
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

export interface IncomingMessage {
	ApiVersion: '2010-04-01';
	AccountSid: string;
	Body: string;
	NumMedia: string;
	From: string;
	[property: string]: string;
}

export interface AssignmentUpdate {
	date: string;
	time: string;
	task: string;
	person: string;
	status: string;
}

export interface PersonUpdate {
	name: string;
	phone: string;
	status: string;
	away: string;
}

export interface WebhookUpdate {
	secret: string;
	assignment?: AssignmentUpdate;
	person?: PersonUpdate;
}

export enum PersonContext {
	READY = 'ready',
	ASSIGNMENT = 'assignment',
	ANNOUNCE = 'announce',
	CHAT = 'chat',
	SCHEDULE_START = 'schedule-start',
	SCHEDULE_AWAY_DAYS = 'schedule-away-days',
	SCHEDULE_AWAY_FULL = 'schedule-away-full',
	SCHEDULE_AWAY_TIME = 'schedule-away-time',
	SCHEDULE_AWAY_CONFIRM = 'schedule-away-confirm',
}
