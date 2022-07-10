"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
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
    normalizedBody(msg) {
        return msg.Body.trim().toLocaleLowerCase().replace(/[!.]^/, '');
    }
    handleMessage(person, msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let rsp = '';
            if (person.context == types_1.PersonContext.ASSIGNMENT) {
                rsp = yield this.handleAssignmentReply(msg, person);
            }
            else if (person.context == types_1.PersonContext.SCHEDULE_START) {
                rsp = yield this.handleScheduleStartReply(msg, person);
            }
            else if (person.context == types_1.PersonContext.SCHEDULE_AWAY) {
                rsp = yield this.handleScheduleAwayReply(msg, person);
            }
            else if (person.status == 'backup') {
                rsp = yield this.handleBackupMessage(msg);
            }
            else {
                yield this.relayToBackup(msg, person);
            }
            return rsp;
        });
    }
    handleBackupMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = this.normalizedBody(msg);
            let namesRegex = yield this.getNamesRegex();
            let announceRegex = this.getAnnounceRegex();
            let rsp = '';
            if (sms == 'schedule') {
                yield this.scheduleStart();
            }
            else if (sms.match(namesRegex)) {
                yield this.relayToPerson(msg);
            }
            else if (sms.match(announceRegex)) {
                rsp = yield this.sendAnnouncement(msg);
            }
            return rsp;
        });
    }
    sendAssignments(due) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
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
                yield assignment.setPending();
            }
        });
    }
    handleAssignmentReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = this.normalizedBody(msg);
            if (!person.assignment) {
                throw new Error(`${person.name} replied in assignment context without an assignment`);
            }
            if (SMS.yesReplies.indexOf(sms) > -1) {
                yield person.assignment.setDone();
                return person_1.default.getAffirmation();
            }
            else if (sms == 'snooze') {
                let time = yield person.assignment.snooze();
                return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
            }
            if (person.status == 'backup') {
                yield this.handleBackupMessage(msg);
            }
            else {
                yield this.relayToBackup(msg, person);
            }
            return '';
        });
    }
    scheduleStart() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let people = sheets.getActivePeople();
            for (let person of people) {
                person.context = types_1.PersonContext.SCHEDULE_START;
                yield this.sendMessage(person, 'It is time to schedule chicken tasks. Are there any days you will be away this week? [reply Y or N]');
            }
        });
    }
    handleScheduleStartReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
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
            let ready = yield this.scheduleIfAllAreReady();
            if (ready) {
                rsp = '';
            }
            return rsp;
        });
    }
    handleScheduleAwayReply(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
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
            let awayDays = yield person.updateAway(existingDays);
            person.context = types_1.PersonContext.READY;
            yield this.sendMessage(person, `Got it, your current away days are: ${awayDays}\n\nI will send your schedule as soon as I hear back from everyone.`);
            yield this.scheduleIfAllAreReady();
            return '';
        });
    }
    scheduleIfAllAreReady() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let activePeople = sheets.getActivePeople();
            let readyPeople = activePeople.filter(p => p.context == types_1.PersonContext.READY);
            let allAreReady = activePeople.length == readyPeople.length;
            if (allAreReady) {
                let calendar = yield calendar_1.default.getInstance();
                calendar.scheduleTasks().then(this.scheduleSend.bind(this));
            }
            return allAreReady;
        });
    }
    scheduleSend() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let people = sheets.getActivePeople();
            for (let person of people) {
                if (person.schedule) {
                    yield this.sendMessage(person, person.schedule);
                }
            }
        });
    }
    sendAnnouncement(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let people = sheets.getActivePeople();
            let match = msg.Body.match(this.getAnnounceRegex());
            if (!match) {
                throw new Error('Could not match announce regex');
            }
            let body = match[1];
            let count = 0;
            for (let person of people) {
                if (person.status != 'backup') {
                    yield this.sendMessage(person, body);
                    count++;
                }
            }
            return `Sent announcement to ${count} people.`;
        });
    }
    relayToBackup(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let backup = yield sheets.currentBackup();
            if (backup) {
                yield this.sendMessage(backup, `${person.name}: ${msg.Body}`);
            }
        });
    }
    relayErrorToBackup(msg, person, error) {
        return __awaiter(this, void 0, void 0, function* () {
            msg.Body = `${person.name}: ${msg.Body}\n${error.message}`;
            yield this.relayToBackup(msg, person);
        });
    }
    relayToPerson(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let namesRegex = yield this.getNamesRegex();
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
            yield this.sendMessage(relayTo, body);
        });
    }
    validateMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            if (msg.AccountSid !== config_1.default.twilio.accountSid) {
                throw new Error('Whoops, Twilio needs to be configured.');
            }
            let [person] = sheets.people.filter(p => msg.From == p.phone);
            if (!person) {
                throw new Error('Sorry, I don’t know who you are.');
            }
            return person;
        });
    }
    sendMessage(person, body) {
        return __awaiter(this, void 0, void 0, function* () {
            app_1.default.log.info(`SMS to ${person.name}: ${body}`);
            yield this.twilio.messages.create({
                from: this.phone,
                to: person.phone,
                body: body
            });
        });
    }
    messageResponse(reply, response) {
        let rsp = new twilio_1.twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
    getNamesRegex() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let names = sheets.getActivePeople().map(p => p.name);
            return new RegExp(`^(${names.join('|')}):\s*(.+)$`, 'msi');
        });
    }
    getAnnounceRegex() {
        return /announce:\s*(.+)$/msi;
    }
}
SMS.yesReplies = ['y', 'yes', 'yep', 'yeah', 'yea', 'yay', 'done', 'indeed', 'yessir', 'affirmative'];
SMS.noReplies = ['n', 'no', 'nope', 'negative', 'nay', 'no sir', 'none'];
exports.default = SMS;
//# sourceMappingURL=sms.js.map