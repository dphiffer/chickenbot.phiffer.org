"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const person_1 = require("../models/person");
const twilio_1 = require("twilio");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const twilio_2 = __importDefault(require("twilio"));
const moment = __importStar(require("moment-timezone"));
const sheets_1 = __importDefault(require("./sheets"));
const calendar_1 = __importDefault(require("./calendar"));
const person_2 = __importDefault(require("../models/person"));
const app_1 = __importDefault(require("../app"));
class Messages {
    constructor() {
        this.isScheduling = false;
        this.scheduleLength = 7;
        this.twilio = (0, twilio_2.default)(Messages.config.accountSid, Messages.config.authToken);
        this.phone = Messages.config.phone;
    }
    static configure(config) {
        this.config = config;
    }
    static getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Messages();
        return this.instance;
    }
    displayPhone(phone) {
        let area = phone.substring(2, 5);
        let prefix = phone.substring(5, 8);
        let postfix = phone.substring(8, 12);
        return `(${area}) ${prefix}-${postfix}`;
    }
    normalizeBody(msg) {
        return msg.Body.trim().toLowerCase().replace(/[!.]^/, '');
    }
    async handleMessage(person, msg) {
        let rsp = '';
        if (person.context == person_1.PersonContext.ASSIGNMENT) {
            rsp = await this.handleAssignmentReply(msg, person);
        }
        else if (person.context == person_1.PersonContext.SCHEDULE_START) {
            rsp = await this.handleScheduleStartReply(msg, person);
        }
        else if (person.context == person_1.PersonContext.SCHEDULE_AWAY_DAYS) {
            rsp = await this.handleScheduleAwayDaysReply(msg, person);
        }
        else if (person.context == person_1.PersonContext.SCHEDULE_AWAY_FULL) {
            rsp = await this.handleScheduleAwayFullReply(msg, person);
        }
        else if (person.context == person_1.PersonContext.SCHEDULE_AWAY_TIME) {
            rsp = await this.handleScheduleAwayTimeReply(msg, person);
        }
        else if (person.context == person_1.PersonContext.SCHEDULE_AWAY_CONFIRM) {
            rsp = await this.handleScheduleAwayConfirmReply(msg, person);
        }
        else if (person.status == person_1.PersonStatus.BACKUP) {
            rsp = await this.handleBackupMessage(msg, person);
        }
        else {
            await this.relayToBackup(msg, person);
        }
        return rsp;
    }
    async handleBackupMessage(msg, backup) {
        let sms = this.normalizeBody(msg);
        let namesRegex = await this.getNamesRegex();
        let announceRegex = this.getAnnounceRegex();
        let backupRegex = await this.getBackupRegex();
        let rsp = '';
        app_1.default.log.info(`Current context: ${backup.context}`);
        if (sms.startsWith('schedule')) {
            await this.scheduleStart(sms);
        }
        else if (sms == 'announce') {
            await this.setAnnounceContext(backup);
        }
        else if (sms == 'ready') {
            rsp = await this.setReadyContext(backup);
        }
        else if (backup.context == person_1.PersonContext.SCHEDULE_SEND) {
            rsp = await this.handleScheduleSendReply(msg, backup);
        }
        else if (backup.context == person_1.PersonContext.ANNOUNCE) {
            rsp = await this.sendAnnouncement(msg, backup);
        }
        else if (sms.match(namesRegex)) {
            await this.relayToPerson(msg, backup);
        }
        else if (sms.match(announceRegex)) {
            rsp = await this.relayAnnouncement(msg, backup);
        }
        else if (sms.match(backupRegex)) {
            rsp = await this.reassignBackup(msg);
        }
        else if (backup.context == person_1.PersonContext.CHAT && backup.chatContext) {
            let media = await this.checkForMedia(msg, backup);
            if (msg.Body == '') {
                msg.Body = '📷';
            }
            await this.sendMessage(backup.chatContext, msg.Body, media);
        }
        else {
            rsp = `Sorry, I didn't understand that command.`;
        }
        return rsp;
    }
    async sendAssignment(person, assignment) {
        let sheets = await sheets_1.default.getInstance();
        let [task] = sheets.tasks.filter(t => t.name == assignment.task);
        if (!task) {
            throw new Error(`Could not find task ${assignment.task}`);
        }
        this.sendMessage(person, `Hi ${person.name}, ${task.question} [reply Y if you're done or Snooze for more time]`);
    }
    async handleAssignmentReply(msg, person) {
        let sms = this.normalizeBody(msg);
        if (!person.assignment) {
            throw new Error(`${person.name} replied in assignment context without an assignment`);
        }
        if (Messages.yesReplies.indexOf(sms) > -1) {
            await person.assignment.setDone();
            return person_2.default.getAffirmation();
        }
        else if (sms == 'snooze') {
            let time = await person.assignment.snooze();
            return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
        }
        if (person.status == person_1.PersonStatus.BACKUP) {
            await this.handleBackupMessage(msg, person);
        }
        else {
            await this.relayToBackup(msg, person);
        }
        return '';
    }
    async scheduleStart(sms) {
        this.isScheduling = true;
        this.scheduleLength = 7;
        let lengthMatch = sms.match(/^schedule (\d+)/);
        if (lengthMatch) {
            this.scheduleLength = parseInt(lengthMatch[1]);
        }
        let quickSchedule = sms.endsWith('!');
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            if (quickSchedule) {
                person.context = person_1.PersonContext.READY;
            }
            else if (person.status != person_1.PersonStatus.VACATION) {
                person.context = person_1.PersonContext.SCHEDULE_START;
                await this.sendMessage(person, `Hi ${person.name}, it is time to schedule chicken tasks. Are there any days you will be away this week? [reply Y or N]`);
            }
        }
        if (quickSchedule) {
            this.scheduleIfAllAreReady();
            return 'Creating a quick schedule.';
        }
    }
    async handleScheduleStartReply(msg, person) {
        let sms = this.normalizeBody(msg);
        let rsp = '';
        if (Messages.yesReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.SCHEDULE_AWAY_DAYS;
            rsp =
                'Which days will you be away this week? [reply with comma-separated days: Mon, Tue or 6/17, 6/18]';
        }
        else if (Messages.noReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.READY;
            rsp = await this.scheduleIfAllAreReady(person);
        }
        else {
            rsp = 'Sorry, please reply with Y or N.';
        }
        return rsp;
    }
    async handleScheduleAwayDaysReply(msg, person) {
        let sms = this.normalizeBody(msg);
        let days = sms.split(',');
        let isoDays = [];
        for (let day of days) {
            let isoDay = calendar_1.default.parseDay(day);
            if (!isoDay) {
                return `Sorry I couldn't make sense of '${day.trim()}'. Please try again.`;
            }
            isoDays.push(isoDay);
        }
        let awayDays = await person.updateAway(isoDays);
        person.context = person_1.PersonContext.SCHEDULE_AWAY_FULL;
        return `Your current away days are: ${awayDays}\n\nWill you be away for the full day on all of those days? [Reply Y for full days or N to specify when you'll be away on each day]`;
    }
    async handleScheduleAwayFullReply(msg, person) {
        let sms = this.normalizeBody(msg);
        let rsp = '';
        if (Messages.noReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.SCHEDULE_AWAY_TIME;
            person.scheduleDayIndex = 0;
            rsp = this.scheduleAwayTime(person);
        }
        else if (Messages.yesReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.READY;
            rsp = await this.scheduleIfAllAreReady(person);
        }
        else {
            rsp = 'Sorry, please reply Y or N.';
        }
        return rsp;
    }
    scheduleAwayTime(person) {
        let days = person.away.split(', ');
        let day = moment
            .default(days[person.scheduleDayIndex], 'YYYY-MM-DD')
            .format('ddd M/D');
        return `When will you be away on ${day}? [Reply AM for morning, PM for evening, or Full for the full day]`;
    }
    async handleScheduleAwayTimeReply(msg, person) {
        let sms = this.normalizeBody(msg);
        let days = person.away.split(', ');
        if (sms == 'am' || sms == 'pm' || sms == 'full') {
            days[person.scheduleDayIndex] += ` ${sms}`;
            let awayDays = await person.updateAway(days);
            person.scheduleDayIndex++;
            if (person.scheduleDayIndex == days.length) {
                person.context = person_1.PersonContext.SCHEDULE_AWAY_CONFIRM;
                return `Thank you, here are your current away days: ${awayDays}\n\nDo those look right to you? [Reply Y or N]`;
            }
            else {
                return this.scheduleAwayTime(person);
            }
        }
        else {
            return 'Sorry, please reply with AM, PM, or Full.';
        }
    }
    async handleScheduleAwayConfirmReply(msg, person) {
        let sms = this.normalizeBody(msg);
        let rsp = '';
        if (Messages.noReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.SCHEDULE_START;
            person.scheduleDayIndex = 0;
            rsp = `Ok, let's start over. Are there any days you will be away this week? [reply Y or N]`;
        }
        else if (Messages.yesReplies.indexOf(sms) > -1) {
            person.context = person_1.PersonContext.READY;
            rsp = await this.scheduleIfAllAreReady(person);
        }
        else {
            rsp = 'Sorry, please reply Y or N.';
        }
        return rsp;
    }
    async scheduleIfAllAreReady(person = null) {
        let sheets = await sheets_1.default.getInstance();
        let active = sheets.getActivePeople();
        let notReady = [];
        active.forEach(p => {
            if (p.context != person_1.PersonContext.READY) {
                if (p.status == person_1.PersonStatus.BACKUP) {
                    notReady.push('you');
                }
                else {
                    notReady.push(p.name);
                }
            }
        });
        let allAreReady = notReady.length == 0;
        if (person && person.status != person_1.PersonStatus.BACKUP) {
            let waiting = allAreReady
                ? ''
                : ` Still waiting on: ${notReady.join(', ')}`;
            let backup = await sheets.currentBackup();
            if (backup) {
                this.sendMessage(backup, `${person.name} is ready to schedule tasks.${waiting}`);
            }
        }
        if (allAreReady) {
            let calendar = await calendar_1.default.getInstance();
            calendar.scheduleTasks(this.scheduleLength).then(async () => {
                let backup = await sheets.currentBackup();
                if (backup) {
                    backup.context = person_1.PersonContext.SCHEDULE_SEND;
                    this.sendMessage(backup, 'Assignment schedules have been created, send them out? [Reply Y or N]');
                }
            });
            return '';
        }
        return 'Thank you, I will send your schedule as soon as I hear back from everyone.';
    }
    async handleScheduleSendReply(msg, backup) {
        let sms = this.normalizeBody(msg);
        if (Messages.yesReplies.indexOf(sms) > -1) {
            this.scheduleSend();
            this.isScheduling = false;
            backup.context = person_1.PersonContext.READY;
            return 'Great, I will send schedules out now.';
        }
        else if (Messages.noReplies.indexOf(sms) > -1) {
            backup.context = person_1.PersonContext.READY;
            return `Not sending. You can remake the schedule with 'schedule!' (the exclamation point skips the process of asking when people are away).`;
        }
        else {
            return 'Sorry, please respond Y or N.';
        }
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
    async setAnnounceContext(backup) {
        if (backup.context == person_1.PersonContext.ANNOUNCE) {
            return;
        }
        await backup.setTemporaryContext(person_1.PersonContext.ANNOUNCE, () => {
            this.sendMessage(backup, '[Done announcing messages]');
        });
        await this.sendMessage(backup, '[Now announcing messages]');
    }
    async setReadyContext(backup) {
        let rsp = '';
        if (this.isScheduling) {
            backup.context = person_1.PersonContext.READY;
            rsp = await this.scheduleIfAllAreReady();
        }
        else if (backup.context == person_1.PersonContext.ANNOUNCE ||
            backup.context == person_1.PersonContext.CHAT) {
            rsp = '[Resetting temporary context]';
        }
        else if (backup.context == person_1.PersonContext.ASSIGNMENT) {
            rsp = '[Abandoning assignment]';
        }
        else {
            rsp = '[You are ready]';
        }
        backup.context = person_1.PersonContext.READY;
        return rsp;
    }
    async setChatContext(person) {
        var _a;
        let sheets = await sheets_1.default.getInstance();
        let backup = await sheets.currentBackup();
        if (!backup) {
            throw new Error('No backup found');
        }
        if (backup.context == person_1.PersonContext.CHAT &&
            ((_a = backup.chatContext) === null || _a === void 0 ? void 0 : _a.name) == person.name) {
            return;
        }
        if (person.name == backup.name) {
            return;
        }
        let onExpire = async () => {
            if (backup) {
                await this.sendMessage(backup, `[Done chatting with ${person.name}]`);
            }
        };
        await backup.setTemporaryContext(person_1.PersonContext.CHAT, onExpire, person);
        await this.sendMessage(backup, `[Now chatting with ${person.name}]`);
    }
    async relayAnnouncement(msg, backup) {
        let match = msg.Body.match(this.getAnnounceRegex());
        if (!match) {
            throw new Error('Could not match announce regex');
        }
        msg.Body = match[1];
        let response = await this.sendAnnouncement(msg, backup);
        return response;
    }
    async sendAnnouncement(msg, backup) {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        let count = 0;
        let media = await this.checkForMedia(msg, backup);
        if (media.length > 0 && msg.Body == '') {
            msg.Body = '📷';
        }
        for (let person of people) {
            if (person.status != person_1.PersonStatus.BACKUP &&
                person.status != person_1.PersonStatus.VACATION) {
                await this.sendMessage(person, msg.Body, media);
                count++;
            }
        }
        return `Sent announcement to ${count} people: ${msg.Body}`;
    }
    async relayToBackup(msg, person) {
        let sheets = await sheets_1.default.getInstance();
        let backup = await sheets.currentBackup();
        let media = await this.checkForMedia(msg, person);
        if (!backup) {
            throw new Error('No backup found');
        }
        await this.sendMessage(backup, `${person.name}: ${msg.Body}`, media);
        await this.setChatContext(person);
    }
    checkForMedia(msg, person) {
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
    downloadMedia(msg, person, num) {
        return new Promise(async (resolve, reject) => {
            try {
                let root = path_1.default.dirname(path_1.default.dirname(__dirname));
                let date = moment.default().format(`YYYY-MM-DD`);
                let ext = '';
                if (msg[`MediaContentType${num}`] == 'image/jpeg') {
                    ext = 'jpg';
                }
                else if (msg[`MediaContentType${num}`] == 'image/gif') {
                    ext = 'gif';
                }
                else if (msg[`MediaContentType${num}`] == 'image/png') {
                    ext = 'png';
                }
                else {
                    throw new Error(`Unexpected image content-type: ${msg[`MediaContentType${num}`]}`);
                }
                let name = person.name.toLowerCase().replace(/\W+/g, '-');
                let fileNum = 0;
                let filename = `${root}/public/media/${date}-${name}-${fileNum}.${ext}`;
                while (fs_1.default.existsSync(filename)) {
                    fileNum++;
                    filename = `${root}/public/media/${date}-${name}-${fileNum}.${ext}`;
                }
                let publicPath = `/media/${date}-${name}-${fileNum}.${ext}`;
                let response = await (0, axios_1.default)({
                    method: 'GET',
                    url: msg[`MediaUrl${num}`],
                    responseType: 'stream',
                });
                const pipe = response.data.pipe(fs_1.default.createWriteStream(filename));
                pipe.on('finish', () => {
                    resolve(`${Messages.config.serverUrl}${publicPath}`);
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    async relayErrorToBackup(msg, person, error) {
        msg.Body = error.message;
        if (person.status != person_1.PersonStatus.BACKUP) {
            msg.Body = `${person.name}: ${msg.Body}\n\n---\n${error.message}`;
        }
        await this.relayToBackup(msg, person);
    }
    async relayToPerson(msg, backup) {
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
        let media = await this.checkForMedia(msg, backup);
        if (media.length > 0 && msg.Body == '') {
            msg.Body = '📷';
        }
        await this.setChatContext(relayTo);
        await this.sendMessage(relayTo, body, media);
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
        await currBackup.updateStatus(person_1.PersonStatus.ACTIVE);
        await newBackup.updateStatus(person_1.PersonStatus.BACKUP);
        await this.sendMessage(newBackup, `Hi ${newBackup.name}, ${currBackup.name} has made you the new designated backup.`);
        return `${newBackup.name} has been notified that they are now the designated backup.`;
    }
    async validateMessage(msg) {
        let sheets = await sheets_1.default.getInstance();
        if (msg.AccountSid !== Messages.config.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [person] = sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }
    async sendMessage(person, body, media = []) {
        app_1.default.log.info(`SMS to ${person.name}: ${body}`);
        await this.twilio.messages.create({
            from: this.phone,
            to: person.phone,
            body: body,
            mediaUrl: media,
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
        return /announce:\s*(.+)$/ims;
    }
    async getBackupRegex() {
        let sheets = await sheets_1.default.getInstance();
        let names = sheets.getActivePeople().map(p => p.name);
        return new RegExp(`^backup:\\s*(${names.join('|')})\\s*$`, 'msi');
    }
}
exports.default = Messages;
Messages.yesReplies = [
    'y',
    'yes',
    'yep',
    'yeah',
    'yea',
    'indeed',
    'affirmative',
];
Messages.noReplies = ['n', 'no', 'nope', 'nay', 'negative'];
//# sourceMappingURL=messages.js.map