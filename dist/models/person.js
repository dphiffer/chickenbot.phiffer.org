"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const sheets_1 = __importDefault(require("../controllers/sheets"));
class Person {
    constructor(sheets, row) {
        this.schedule = null;
        this.assignment = null;
        this.context = types_1.PersonContext.READY;
        this.name = row.name;
        this.phone = this.normalizePhone(row.phone);
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
    static getAffirmation() {
        let affirmations = [
            'Thank you!',
            'The chickens appreciate you so much.',
            'Excellent, thank you.',
            'You’re the best!',
            '❤️🐔❤️'
        ];
        let index = Math.floor(Math.random() * affirmations.length);
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
        let sheets = await sheets_1.default.getInstance();
        awayDays = awayDays.filter(date => {
            return date >= (0, moment_timezone_1.default)().format('YYYY-MM-DD');
        });
        this.away = awayDays.join(', ');
        let sheet = sheets.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            if (row.name == this.name) {
                row.away = this.away;
                await row.save();
                break;
            }
        }
        return awayDays.map(date => {
            return (0, moment_timezone_1.default)(date, 'YYYY-MM-DD').format('ddd M/D');
        }).join(', ');
    }
    isAway(date) {
        let awayDays = this.away.split(', ');
        if (awayDays.indexOf(date) > -1) {
            return true;
        }
        return false;
    }
}
exports.default = Person;
//# sourceMappingURL=person.js.map