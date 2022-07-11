"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("../app"));
const types_1 = require("../types");
const twilio_1 = require("twilio");
const twilio_2 = __importDefault(require("twilio"));
const sheets_1 = __importDefault(require("./sheets"));
const calendar_1 = __importDefault(require("./calendar"));
const person_1 = __importDefault(require("../models/person"));
class SMS {
    constructor() {
        this.twilio = (0, twilio_2.default)(SMS.config.accountSid, SMS.config.authToken);
        this.phone = SMS.config.phone;
    }
    static configure(config) {
        this.config = config;
    }
    static getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new SMS();
        return this.instance;
    }
    displayPhone(phone) {
        let area = phone.substring(2, 5);
        let prefix = phone.substring(5, 8);
        let postfix = phone.substring(8, 12);
        return `(${area}) ${prefix}-${postfix}`;
    }
    normalizedBody(msg) {
        return msg.Body.trim().toLocaleLowerCase().replace(/[!.]^/, '');
    }
    async handleMessage(person, msg) {
        let rsp = '';
        if (person.context == types_1.PersonContext.ASSIGNMENT) {
            rsp = await this.handleAssignmentReply(msg, person);
        }
        else if (person.context == types_1.PersonContext.SCHEDULE_START) {
            rsp = await this.handleScheduleStartReply(msg, person);
        }
        else if (person.context == types_1.PersonContext.SCHEDULE_AWAY) {
            rsp = await this.handleScheduleAwayReply(msg, person);
        }
        else if (person.status == 'backup') {
            rsp = await this.handleBackupMessage(msg);
        }
        else {
            await this.relayToBackup(msg, person);
        }
        return rsp;
    }
    async handleBackupMessage(msg) {
        let sms = this.normalizedBody(msg);
        let namesRegex = await this.getNamesRegex();
        let announceRegex = this.getAnnounceRegex();
        let backupRegex = await this.getBackupRegex();
        let rsp = '';
        if (sms == 'schedule') {
            await this.scheduleStart();
        }
        else if (sms.match(namesRegex)) {
            await this.relayToPerson(msg);
        }
        else if (sms.match(announceRegex)) {
            rsp = await this.sendAnnouncement(msg);
        }
        else if (sms.match(backupRegex)) {
            rsp = await this.reassignBackup(msg);
        }
        else {
            rsp = `Sorry, I didn't understand that command.`;
        }
        return rsp;
    }
    async sendAssignments(due) {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        for (let assignment of due) {
            let [person] = people.filter(p => p.name == assignment.person);
            let [task] = sheets.tasks.filter(t => t.name == assignment.task);
            if (!person || !task) {
                continue;
            }
            this.sendMessage(person, `Hi ${person.name}, ${task.question} [reply Y if you're done or Snooze for more time]`);
            person.assignment = assignment;
            person.context = types_1.PersonContext.ASSIGNMENT;
            await assignment.setPending();
        }
    }
    async handleAssignmentReply(msg, person) {
        let sms = this.normalizedBody(msg);
        if (!person.assignment) {
            throw new Error(`${person.name} replied in assignment context without an assignment`);
        }
        if (SMS.yesReplies.indexOf(sms) > -1) {
            await person.assignment.setDone();
            return person_1.default.getAffirmation();
        }
        else if (sms == 'snooze') {
            let time = await person.assignment.snooze();
            return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
        }
        if (person.status == 'backup') {
            await this.handleBackupMessage(msg);
        }
        else {
            await this.relayToBackup(msg, person);
        }
        return '';
    }
    async scheduleStart() {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            person.context = types_1.PersonContext.SCHEDULE_START;
            await this.sendMessage(person, 'It is time to schedule chicken tasks. Are there any days you will be away this week? [reply Y or N]');
        }
    }
    async handleScheduleStartReply(msg, person) {
        let sms = msg.Body.trim().toLocaleLowerCase();
        let rsp = '';
        if (sms == 'y') {
            person.context = types_1.PersonContext.SCHEDULE_AWAY;
            rsp = 'Which days will you be away this week? [reply Mon, Tue or 6/17]';
        }
        else if (sms == 'n') {
            person.context = types_1.PersonContext.READY;
            rsp = 'Thank you, I will send your schedule as soon as I hear back from everyone.';
        }
        let ready = await this.scheduleIfAllAreReady();
        if (ready) {
            rsp = '';
        }
        return rsp;
    }
    async handleScheduleAwayReply(msg, person) {
        let sms = msg.Body.trim();
        let newDays = sms.split(',');
        let existingDays = person.away.split(', ');
        for (let day of newDays) {
            let isoDay = calendar_1.default.parseDay(day);
            if (!isoDay) {
                throw new Error(`Sorry I couldn't make sense of '${day}' (away dates must be in the future). Please try again.`);
            }
            existingDays.push(isoDay);
        }
        let awayDays = await person.updateAway(existingDays);
        person.context = types_1.PersonContext.READY;
        await this.sendMessage(person, `Got it, your current away days are: ${awayDays}\n\nI will send your schedule as soon as I hear back from everyone.`);
        await this.scheduleIfAllAreReady();
        return '';
    }
    async scheduleIfAllAreReady() {
        let sheets = await sheets_1.default.getInstance();
        let activePeople = sheets.getActivePeople();
        let readyPeople = activePeople.filter(p => p.context == types_1.PersonContext.READY);
        let allAreReady = activePeople.length == readyPeople.length;
        if (allAreReady) {
            let calendar = await calendar_1.default.getInstance();
            calendar.scheduleTasks().then(this.scheduleSend.bind(this));
        }
        return allAreReady;
    }
    async scheduleSend() {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            if (person.schedule) {
                await this.sendMessage(person, person.schedule);
            }
        }
    }
    async sendAnnouncement(msg) {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        let match = msg.Body.match(this.getAnnounceRegex());
        if (!match) {
            throw new Error('Could not match announce regex');
        }
        let body = match[1];
        let count = 0;
        for (let person of people) {
            if (person.status != 'backup') {
                await this.sendMessage(person, body);
                count++;
            }
        }
        return `Sent announcement to ${count} people.`;
    }
    async relayToBackup(msg, person) {
        let sheets = await sheets_1.default.getInstance();
        let backup = await sheets.currentBackup();
        if (backup) {
            await this.sendMessage(backup, `${person.name}: ${msg.Body}`);
        }
    }
    async relayErrorToBackup(msg, person, error) {
        msg.Body = `${person.name}: ${msg.Body}\n${error.message}`;
        await this.relayToBackup(msg, person);
    }
    async relayToPerson(msg) {
        let sheets = await sheets_1.default.getInstance();
        let namesRegex = await this.getNamesRegex();
        let match = msg.Body.match(namesRegex);
        if (!match) {
            throw new Error('Could not match reply regex');
        }
        let name = match[1];
        let body = match[2];
        let [relayTo] = sheets.people.filter(p => p.name == name);
        if (!relayTo) {
            throw new Error('Could not find person to relay message to');
        }
        await this.sendMessage(relayTo, body);
    }
    async reassignBackup(msg) {
        let sheets = await sheets_1.default.getInstance();
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
        let [newBackup] = sheets.people.filter(p => p.name.toLowerCase() == name.toLowerCase());
        await currBackup.updateStatus('active');
        await newBackup.updateStatus('backup');
        await this.sendMessage(newBackup, `Hi ${newBackup.name}, ${currBackup.name} has made you the new designated backup.`);
        return `${newBackup.name} has been notified that they are now the designated backup.`;
    }
    async validateMessage(msg) {
        let sheets = await sheets_1.default.getInstance();
        if (msg.AccountSid !== SMS.config.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [person] = sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }
    async sendMessage(person, body) {
        app_1.default.log.info(`SMS to ${person.name}: ${body}`);
        await this.twilio.messages.create({
            from: this.phone,
            to: person.phone,
            body: body
        });
    }
    messageResponse(reply, response) {
        let rsp = new twilio_1.twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
    async getNamesRegex() {
        let sheets = await sheets_1.default.getInstance();
        let names = sheets.getActivePeople().map(p => p.name);
        return new RegExp(`^(${names.join('|')}):\\s*(.+)$`, 'msi');
    }
    getAnnounceRegex() {
        return /announce:\s*(.+)$/msi;
    }
    async getBackupRegex() {
        let sheets = await sheets_1.default.getInstance();
        let names = sheets.getActivePeople().map(p => p.name);
        return new RegExp(`^backup:\\s*(${names.join('|')})\\s*$`, 'msi');
    }
}
SMS.yesReplies = ['y', 'yes', 'yep', 'yeah', 'yea', 'yay', 'done', 'indeed', 'yessir', 'affirmative'];
SMS.noReplies = ['n', 'no', 'nope', 'negative', 'nay', 'no sir', 'none'];
exports.default = SMS;
//# sourceMappingURL=sms.js.map