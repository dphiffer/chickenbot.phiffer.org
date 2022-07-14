import app from '../app';

import { FastifyReply } from 'fastify';
import { SMSConfig, IncomingMessage, PersonContext } from '../types';
import { twiml } from 'twilio';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as moment from 'moment-timezone';

import twilio from 'twilio';
import Sheets from './sheets';
import Calendar from './calendar';
import Person from '../models/person';
import Assignment from '../models/assignment';

class SMS {

    private static config: SMSConfig;
    static instance: SMS;
    static yesReplies = ['y', 'yes', 'yep', 'yeah', 'yea', 'yay', 'done', 'indeed', 'yessir', 'affirmative'];
    static noReplies = ['n', 'no', 'nope', 'negative', 'nay', 'no sir', 'none'];

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

    displayPhone(phone: string) {
        let area = phone.substring(2, 5);
        let prefix = phone.substring(5, 8);
        let postfix = phone.substring(8, 12);
        return `(${area}) ${prefix}-${postfix}`;
    }

    normalizedBody(msg: IncomingMessage) {
        return msg.Body.trim().toLocaleLowerCase().replace(/[!.]^/, '');
    }

    async handleMessage(person: Person, msg: IncomingMessage): Promise<string> {
        let rsp = '';
        if (person.context == PersonContext.ASSIGNMENT) {
            rsp = await this.handleAssignmentReply(msg, person);
        } else if (person.context == PersonContext.SCHEDULE_START) {
            rsp = await this.handleScheduleStartReply(msg, person);
        } else if (person.context == PersonContext.SCHEDULE_AWAY) {
            rsp = await this.handleScheduleAwayReply(msg, person);
        } else if (person.status == 'backup') {
            rsp = await this.handleBackupMessage(msg, person);
        } else {
            await this.relayToBackup(msg, person);
        }
        return rsp;
    }

    async handleBackupMessage(msg: IncomingMessage, backup: Person) {
        let sms = this.normalizedBody(msg);
        let namesRegex = await this.getNamesRegex();
        let announceRegex = this.getAnnounceRegex();
        let backupRegex = await this.getBackupRegex();
        let rsp = '';
        if (sms == 'schedule') {
            await this.scheduleStart();
        } else if (sms == 'announce') {
            await this.setAnnounceContext(backup);
        } else if (backup.context == PersonContext.ANNOUNCE) {
            rsp = await this.sendAnnouncement(msg.Body);
        } else if (sms.match(namesRegex)) {
            await this.relayToPerson(msg);
        } else if (sms.match(announceRegex)) {
            rsp = await this.relayAnnouncement(msg);
        } else if (sms.match(backupRegex)) {
            rsp = await this.reassignBackup(msg);
        } else if (backup.context == PersonContext.CHAT && backup.chatContext) {
            await this.sendMessage(backup.chatContext, msg.Body);
        } else {
            rsp = `Sorry, I didn't understand that command.`
        }
        return rsp;
    }

    async sendAssignments(due: Assignment[]) {
        let sheets = await Sheets.getInstance();
        let people = sheets.getActivePeople();
        for (let assignment of due) {
            let [ person ] = people.filter(p => p.name == assignment.person);
            let [ task ] = sheets.tasks.filter(t => t.name == assignment.task);
            if (!person || !task) {
                continue;
            }
            this.sendMessage(person, `Hi ${person.name}, ${task.question} [reply Y if you're done or Snooze for more time]`);
            person.assignment = assignment;
            person.context = PersonContext.ASSIGNMENT;
            await assignment.setPending();
        }
    }

    async handleAssignmentReply(msg: IncomingMessage, person: Person) {
        let sms = this.normalizedBody(msg);
        if (!person.assignment) {
            throw new Error(`${person.name} replied in assignment context without an assignment`);
        }
        if (SMS.yesReplies.indexOf(sms) > -1) {
            await person.assignment.setDone();
            return Person.getAffirmation();
        } else if (sms == 'snooze') {
            let time = await person.assignment.snooze();
            return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
        }
        if (person.status == 'backup') {
            await this.handleBackupMessage(msg, person);
        } else {
            await this.relayToBackup(msg, person);
        }
        return '';
    }

    async scheduleStart() {
        let sheets = await Sheets.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            person.context = PersonContext.SCHEDULE_START;
            await this.sendMessage(person, 'It is time to schedule chicken tasks. Are there any days you will be away this week? [reply Y or N]');
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

    async setAnnounceContext(backup: Person) {
        if (backup.context == PersonContext.ANNOUNCE) {
            return;
        }
        await backup.setTemporaryContext(PersonContext.ANNOUNCE);
        await this.sendMessage(backup, '[Now announcing messages]');
    }

    async setChatContext(person: Person) {
        let sheets = await Sheets.getInstance();
        let backup = await sheets.currentBackup();
        if (!backup) {
            throw new Error('No backup found');
        }
        if (backup.context == PersonContext.CHAT && backup.chatContext?.name == person.name) {
            return;
        }
        await backup.setTemporaryContext(PersonContext.CHAT, person);
        await this.sendMessage(backup, `[Now chatting with ${person.name}]`);
    }

    async relayAnnouncement(msg: IncomingMessage) {
        let match = msg.Body.match(this.getAnnounceRegex());
        if (!match) {
            throw new Error('Could not match announce regex');
        }
        let response = await this.sendAnnouncement(match[1]);
        return response;
    }

    async sendAnnouncement(body: string) {
        let sheets = await Sheets.getInstance();
        let people = sheets.getActivePeople();
        let count = 0;
        for (let person of people) {
            if (person.status != 'backup') {
                await this.sendMessage(person, body);
                count++;
            }
        }
        return `Sent announcement to ${count} people: ${body}`;
    }

    async relayToBackup(msg: IncomingMessage, person: Person) {
        let sheets = await Sheets.getInstance();
        let backup = await sheets.currentBackup();
        let media = await this.checkForMedia(msg, person);
        if (!backup) {
            throw new Error('No backup found');
        }
        await this.sendMessage(backup, `${person.name}: ${msg.Body}`, media);
        await this.setChatContext(person);
    }

    checkForMedia(msg: IncomingMessage, person: Person): Promise<string[]> {
        if (!msg.NumMedia || !msg.NumMedia.match(/^\d+$/)) {
            throw new Error('NumMedia is not assigned to msg');
        }
        let count = parseInt(msg.NumMedia);
        let promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(this.downloadMedia(msg, person, i));
        }
        return Promise.all(promises);
    }

    downloadMedia(msg: IncomingMessage, person: Person, num: number): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                let root = path.dirname(path.dirname(__dirname));
                let date = moment.default().format(`YYYY-MM-DD`);
                let ext = '';
                if (msg[`MediaContentType${num}`] == 'image/jpeg') {
                    ext = 'jpg';
                } else if (msg[`MediaContentType${num}`] == 'image/gif') {
                    ext = 'gif';
                } else if (msg[`MediaContentType${num}`] == 'image/png') {
                    ext = 'png';
                } else {
                    throw new Error(`Unexpected image content-type: ${msg[`MediaContentType${num}`]}`);
                }
                let fileNum = 0;
                let filename = `${root}/public/media/${date}-${fileNum}.${ext}`;
                while (fs.existsSync(filename)) {
                    fileNum++;
                    filename = `${root}/public/media/${date}-${fileNum}.${ext}`;
                }
                let publicPath = `/media/${date}-${fileNum}.${ext}`;
                let response = await axios({
                    method: 'GET',
                    url: msg[`MediaUrl${num}`],
                    responseType: 'stream'
                });
                const pipe = response.data.pipe(fs.createWriteStream(filename));
                pipe.on('finish', () => {
                    resolve(`${SMS.config.serverUrl}${publicPath}`);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    async relayErrorToBackup(msg: IncomingMessage, person: Person, error: Error) {
        msg.Body = `${person.name}: ${msg.Body}\n${error.message}`;
        await this.relayToBackup(msg, person);
    }

    async relayToPerson(msg: IncomingMessage) {
        let sheets = await Sheets.getInstance();
        let namesRegex = await this.getNamesRegex();
        let match = msg.Body.match(namesRegex);
        if (!match) {
            throw new Error('Could not match reply regex');
        }
        let name = match[1];
        let body = match[2];
        let [ relayTo ] = sheets.people.filter(p => p.name == name);
        if (!relayTo) {
            throw new Error('Could not find person to relay message to');
        }
        await this.setChatContext(relayTo);
        await this.sendMessage(relayTo, body);
    }

    async reassignBackup(msg: IncomingMessage) {
        let sheets = await Sheets.getInstance();
        let currBackup = await sheets.currentBackup();
        if (!currBackup) {
            throw new Error('Could not find current backup');
        }
        let backupRegex = await this.getBackupRegex();
        let match = msg.Body.match(backupRegex);
        if (!match) {
            throw new Error('Could not match backup regex');
        }
        let name = match[1];
        let [ newBackup ] = sheets.people.filter(p => p.name.toLowerCase() == name.toLowerCase());
        await currBackup.updateStatus('active')
        await newBackup.updateStatus('backup')
        await this.sendMessage(newBackup, `Hi ${newBackup.name}, ${currBackup.name} has made you the new designated backup.`);
        return `${newBackup.name} has been notified that they are now the designated backup.`;
    }

    async validateMessage(msg: IncomingMessage) {
        let sheets = await Sheets.getInstance();
        if (msg.AccountSid !== SMS.config.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [ person ] = sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }

    async sendMessage(person: Person, body: string, media: string[] = []) {
        app.log.info(`SMS to ${person.name}: ${body}`);
        await this.twilio.messages.create({
            from: this.phone,
            to: person.phone,
            body: body,
            mediaUrl: media
        });
    }

    messageResponse(reply: FastifyReply, response: string) {
        let rsp = new twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }

    async getNamesRegex() {
        let sheets = await Sheets.getInstance();
        let names = sheets.getActivePeople().map(p => p.name);
        return new RegExp(`^(${names.join('|')}):\\s*(.+)$`, 'msi');
    }
    
    getAnnounceRegex() {
        return /announce:\s*(.+)$/msi;
    }

    async getBackupRegex() {
        let sheets = await Sheets.getInstance();
        let names = sheets.getActivePeople().map(p => p.name);
        return new RegExp(`^backup:\\s*(${names.join('|')})\\s*$`, 'msi');
    }
}

export default SMS;