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
    twilio: {
        accountSid: string;
        authToken: string;
    }
}

interface SheetsConfig {
    spreadsheetId: string;
    credentials: string;
    webhookSecret: string;
}

interface IncomingMessage {
    ApiVersion: '2010-04-01',
    AccountSid: string,
    Body: string,
    NumMedia: string,
    From: string,
    [property: string]: string
}

export {
    Config,
    SheetsConfig,
    IncomingMessage
};