import LoggerOptions from 'pino';

interface Config {
	url: string;
	phone: string;
	timezone: string;
	latitude: number;
	longitude: number;
	server: {
        port: number;
        host: string;
    },
    logger: boolean | LoggerOptions.LoggerOptions,
    google: SheetsConfig,
    twilio: SMSConfig
}

interface SheetsConfig {
    spreadsheetId: string;
    credentials: string;
    webhookSecret: string;
}

interface SMSConfig {
    accountSid: string;
    authToken: string;
}

interface IncomingMessage {
    ApiVersion: '2010-04-01',
    AccountSid: string,
    Body: string,
    NumMedia: string,
    From: string,
    [property: string]: string
}

interface EventUpdate {
    secret: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;
}

export {
    Config,
    SheetsConfig,
    SMSConfig,
    IncomingMessage,
    EventUpdate
};