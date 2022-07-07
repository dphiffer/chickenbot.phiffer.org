import config from './config';
import { FastifyReply } from 'fastify';
import { SMSConfig, IncomingMessage } from './types';
import { twiml } from 'twilio';
import twilio from 'twilio';
import Sheets from './sheets';
import Calendar from './calendar';
import Person from './models/person';

class SMS {

    static instance: SMS;

    twilio: twilio.Twilio;
    sheets: Sheets;
    
    static getInstance(config: SMSConfig, sheets: Sheets) {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new SMS(config, sheets);
        return this.instance;
    }

    private constructor(config: SMSConfig, sheets: Sheets) {
        this.twilio = twilio(config.accountSid, config.authToken);
        this.sheets = sheets;
    }

    async handleMessage(msg: IncomingMessage): Promise<string> {
        let person = this.validateMessage(msg);
        let rsp = '';
        if (person.status == 'backup') {
            rsp = await this.handleBackupMessages(msg, person);
        } 
        return rsp;
    }

    async handleBackupMessages(msg: IncomingMessage, person: Person) {
        let sms = msg.Body.trim();
        let sheets = await Sheets.getInstance(config.google);
        let calendar = await Calendar.getInstance(sheets);
        if (sms.match(/^schedule[.!]?$/i)) {
            await calendar.scheduleTasks();
            return 'Ok, scheduling tasks';
        }
        return '';
    }

    validateMessage(msg: IncomingMessage): Person {
        if (msg.AccountSid !== config.twilio.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [ person ] = this.sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }

    messageResponse(reply: FastifyReply, response: string) {
        let rsp = new twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
}

export default SMS;