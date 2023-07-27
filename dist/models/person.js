"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonStatus = exports.PersonContext = void 0;
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const sheets_1 = __importDefault(require("../controllers/sheets"));
const timers_1 = require("timers");
const app_1 = __importDefault(require("../app"));
var PersonContext;
(function (PersonContext) {
    PersonContext["READY"] = "ready";
    PersonContext["ASSIGNMENT"] = "assignment";
    PersonContext["ANNOUNCE"] = "announce";
    PersonContext["CHAT"] = "chat";
    PersonContext["SCHEDULE_START"] = "schedule-start";
    PersonContext["SCHEDULE_AWAY_DAYS"] = "schedule-away-days";
    PersonContext["SCHEDULE_AWAY_FULL"] = "schedule-away-full";
    PersonContext["SCHEDULE_AWAY_TIME"] = "schedule-away-time";
    PersonContext["SCHEDULE_AWAY_CONFIRM"] = "schedule-away-confirm";
    PersonContext["SCHEDULE_SEND"] = "schedule-send";
})(PersonContext = exports.PersonContext || (exports.PersonContext = {}));
var PersonStatus;
(function (PersonStatus) {
    PersonStatus["ACTIVE"] = "active";
    PersonStatus["BACKUP"] = "backup";
    PersonStatus["INACTIVE"] = "inactive";
    PersonStatus["VACATION"] = "vacation";
})(PersonStatus = exports.PersonStatus || (exports.PersonStatus = {}));
class Person {
    constructor(sheets, row) {
        this.schedule = null;
        this.assignment = null;
        this.context = PersonContext.READY;
        this.chatContext = null;
        this.contextTimeout = null;
        this.scheduleDayIndex = 0;
        this.name = row.name;
        this.phone = this.normalizePhone(row.phone);
        this.call = row.call == 'yes';
        this.status = row.status;
        this.away = row.away || '';
    }
    normalizePhone(phone) {
        phone = phone.replace(/\D/g, '');
        if (phone.substring(0, 1) != '1') {
            phone = `1${phone}`;
        }
        phone = `+${phone}`;
        return phone;
    }
    static getAffirmation(textOnly = false) {
        let affirmations = [
            'Thank you!',
            'The chickens appreciate you so much.',
            'Excellent, thank you.',
            'You’re the best!',
            '❤️🐔❤️',
        ];
        let length = textOnly ? affirmations.length - 1 : affirmations.length;
        let index = Math.floor(Math.random() * length);
        return affirmations[index];
    }
    async updateStatus(status) {
        let sheets = await sheets_1.default.getInstance();
        this.status = status;
        let sheet = sheets.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            if (row.name == this.name) {
                row.status = status;
                await row.save();
                break;
            }
        }
        return this;
    }
    async updateAway(awayDays) {
        this.away = awayDays.join(', ');
        let sheets = await sheets_1.default.getInstance();
        let sheet = sheets.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            if (row.name == this.name) {
                row.away = this.away;
                await row.save();
                break;
            }
        }
        return awayDays
            .map(date => {
            let suffix = '';
            if (date.match(/ am$/)) {
                date = date.replace(/ am$/, '');
                suffix = ' (morning)';
            }
            else if (date.match(/ pm$/)) {
                date = date.replace(/ pm$/, '');
                suffix = ' (evening)';
            }
            else if (date.match(/ full$/)) {
                date = date.replace(/ full$/, '');
                suffix = ' (full day)';
            }
            return (0, moment_timezone_1.default)(date, 'YYYY-MM-DD').format('ddd M/D') + suffix;
        })
            .join(', ');
    }
    setSchedule(assignments) {
        let assigned = assignments.map(a => {
            let date = (0, moment_timezone_1.default)(a.date, 'M/D').format('ddd M/D');
            return `${date}: ${a.task}`;
        });
        if (assigned.length == 0) {
            this.schedule = null;
            return;
        }
        let vacationApology = this.status == PersonStatus.VACATION
            ? 'sorry to interrupt your vacation but '
            : '';
        this.schedule = `Hi ${this.name}, ${vacationApology}here are your scheduled chicken tasks for this week:\n${assigned.join('\n')}`;
    }
    isAway(date, time) {
        let awayDays = this.away.split(', ');
        if (awayDays.indexOf(date) > -1) {
            return true;
        }
        for (let day of awayDays) {
            let regex = new RegExp(`^${date} (am|pm|full)$`);
            let match = day.match(regex);
            if (match) {
                let taskTime = (0, moment_timezone_1.default)(`${date} ${time}`, 'YYYY-MM-DD h:mm A').format('YYYY-MM-DD HH:mm');
                if (match[1] == 'am') {
                    let awayStart = `${date} 00:00`;
                    let awayEnd = `${date} 12:00`;
                    if (taskTime >= awayStart && taskTime <= awayEnd) {
                        return true;
                    }
                }
                else if (match[1] == 'pm') {
                    let awayStart = `${date} 12:00`;
                    let awayEnd = `${date} 23:59`;
                    if (taskTime >= awayStart && taskTime <= awayEnd) {
                        return true;
                    }
                }
                else if (match[1] == 'full') {
                    return true;
                }
            }
        }
        return false;
    }
    async setTemporaryContext(context, onExpire, chatContext = null) {
        app_1.default.log.warn(`Setting ${this.name}'s temporary context to '${context}'`);
        this.context = context;
        if (chatContext) {
            this.chatContext = chatContext;
        }
        if (this.contextTimeout) {
            (0, timers_1.clearTimeout)(this.contextTimeout);
        }
        this.contextTimeout = setTimeout(() => {
            onExpire();
            app_1.default.log.warn(`Resetting ${this.name}'s context to '${PersonContext.READY}'`);
            if (this.context == context) {
                this.context = PersonContext.READY;
            }
            this.chatContext = null;
            this.contextTimeout = null;
        }, 60 * 60 * 1000);
    }
}
exports.default = Person;
//# sourceMappingURL=person.js.map