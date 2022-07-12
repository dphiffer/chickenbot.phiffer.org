import LoggerOptions from 'pino';

interface Config {
	server: {
        port: number;
        host: string;
        url: string;
    }
    logger: boolean | LoggerOptions.LoggerOptions;
    google: SheetsConfig;
    twilio: SMSConfig;
    calendar: CalendarConfig;
}

interface SheetsConfig {
    spreadsheetId: string;
    credentials: string;
    webhookSecret: string;
}

interface SMSConfig {
    accountSid: string;
    authToken: string;
    phone: string;
}

interface CalendarConfig {
    timezone: string;
    latitude: number;
    longitude: number;
}

interface IncomingMessage {
    ApiVersion: '2010-04-01';
    AccountSid: string;
    Body: string;
    NumMedia: string;
    From: string;
    [property: string]: string;
}

interface AssignmentUpdate {
    secret?: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;
}

enum PersonContext {
    READY = 'ready',
    ASSIGNMENT = 'assignment',
    SCHEDULE_START = 'schedule-start',
    SCHEDULE_AWAY = 'schedule-away'
}

export {
    Config,
    SheetsConfig,
    SMSConfig,
    CalendarConfig,
    PersonContext,
    IncomingMessage,
    AssignmentUpdate
};