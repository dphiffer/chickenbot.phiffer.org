import config from '../config';
import { FastifyReply } from 'fastify';
import { SMSConfig, IncomingMessage, PersonContext } from '../types';
import { twiml } from 'twilio';

import twilio from 'twilio';
import Sheets from './sheets';
import Calendar from './calendar';
import Person from '../models/person';

class SMS {

    private static config: SMSConfig;
    static instance: SMS;

    twilio: twilio.Twilio;
    phone: string;
    
    private constructor() {
        this.twilio = twilio(SMS.config.accountSid, SMS.config.authToken);
        this.phone = SMS.config.phone;
    }

    static configure(config: SMSConfig) {
        this.config = config;
    }

    static getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new SMS();
        return this.instance;
    }

    async handleMessage(msg: IncomingMessage): Promise<string> {
        let person = await this.validateMessage(msg);
        let rsp = '';
        if (person.context == PersonContext.ASSIGNMENT) {
            rsp = await this.handleAssignmentReply(msg, person);
        } else if (person.context == PersonContext.SCHEDULE_START) {
            rsp = await this.handleScheduleStartReply(msg, person);
        } else if (person.context == PersonContext.SCHEDULE_AWAY) {
            rsp = await this.handleScheduleAwayReply(msg, person);
        } else if (person.status == 'backup') {
            rsp = await this.handleBackupMessages(msg, person);
        } else {
            await this.relayToBackup(msg, person);
        }
        return rsp;
    }

    async handleAssignmentReply(msg: IncomingMessage, person: Person) {
        let sms = msg.Body.trim().toLowerCase();
        if (person.assignment && (sms == 'y' || sms == 'yes')) {
            person.assignment.status = 'done';
            await person.assignment.save();
            return Person.getAffirmation();
        }
        await this.relayToBackup(msg, person);
        return '';
    }

    async handleBackupMessages(msg: IncomingMessage, person: Person) {
        let sms = msg.Body.trim().toLocaleLowerCase();
        if (sms == 'schedule') {
            await this.scheduleStart();
        }
        return '';
    }

    async scheduleStart() {
        let sheets = await Sheets.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            person.context = PersonContext.SCHEDULE_START;
            await this.sendMessage(person, 'It is time to schedule chicken tasks. Are there any days you will be away? [reply Y or N]');
        }
    }

    async handleScheduleStartReply(msg: IncomingMessage, person: Person) {
        let sms = msg.Body.trim().toLocaleLowerCase();
        let rsp = '';
        if (sms == 'y') {
            person.context = PersonContext.SCHEDULE_AWAY;
            rsp = 'Which days will you be away this week? [reply Mon, Tue or 6/17]';
        } else if (sms == 'n') {
            person.context = PersonContext.READY;
            rsp = 'Thank you, I will send your schedule as soon as I hear back from everyone.';
        }
        let ready = await this.scheduleIfAllAreReady();
        if (ready) {
            rsp = '';
        }
        return rsp;
    }

    async handleScheduleAwayReply(msg: IncomingMessage, person: Person) {
        let sms = msg.Body.trim();
        let newDays = sms.split(',');
        let existingDays = person.away.split(', ');
        for (let day of newDays) {
            let isoDay = Calendar.parseDay(day);
            if (! isoDay) {
                throw new Error(`Sorry I couldn't make sense of '${day}' (away dates must be in the future). Please try again.`);
            }
            existingDays.push(isoDay);
        }
        let awayDays = await person.updateAway(existingDays);
        person.context = PersonContext.READY;
        await this.sendMessage(person, `Got it, your current away days are: ${awayDays}\n\nI will send your schedule as soon as I hear back from everyone.`);
        await this.scheduleIfAllAreReady();
        return '';
    }

    async scheduleIfAllAreReady() {
        let sheets = await Sheets.getInstance();
        let activePeople = sheets.getActivePeople();
        let readyPeople = activePeople.filter(p => p.context == PersonContext.READY);
        let allAreReady = activePeople.length == readyPeople.length;
        if (allAreReady) {
            let calendar = await Calendar.getInstance();
            calendar.scheduleTasks().then(this.scheduleSend.bind(this));
        }
        return allAreReady;
    }

    async scheduleSend() {
        let sheets = await Sheets.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            if (person.schedule) {
                await this.sendMessage(person, person.schedule);
            }
        }
    }

    async relayToBackup(msg: IncomingMessage, person: Person) {
        let sheets = await Sheets.getInstance();
        let backup = await sheets.currentBackup();
        if (backup) {
            await this.sendMessage(backup, `${person.name}: ${msg.Body}`);
        }
    }

    async relayErrorToBackup(msg: IncomingMessage, person: Person, error: Error) {
        msg.Body = `${person.name}: ${msg.Body}\n${error.message}`;
        await this.relayToBackup(msg, person);
    }

    async validateMessage(msg: IncomingMessage) {
        let sheets = await Sheets.getInstance();
        if (msg.AccountSid !== config.twilio.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [ person ] = sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }

    async sendMessage(person: Person, body: string) {
        await this.twilio.messages.create({
            from: this.phone,
            to: person.phone,
            body: body
        });
    }

    messageResponse(reply: FastifyReply, response: string) {
        let rsp = new twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
}

export default SMS;