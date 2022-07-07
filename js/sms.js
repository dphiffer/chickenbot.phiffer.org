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
const config_1 = __importDefault(require("./config"));
const twilio_1 = require("twilio");
const twilio_2 = __importDefault(require("twilio"));
const sheets_1 = __importDefault(require("./sheets"));
const calendar_1 = __importDefault(require("./calendar"));
class SMS {
    constructor(config, sheets) {
        this.twilio = (0, twilio_2.default)(config.accountSid, config.authToken);
        this.sheets = sheets;
    }
    static getInstance(config, sheets) {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new SMS(config, sheets);
        return this.instance;
    }
    handleMessage(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let person = this.validateMessage(msg);
            let rsp = '';
            if (person.status == 'backup') {
                rsp = yield this.handleBackupMessages(msg, person);
            }
            return rsp;
        });
    }
    handleBackupMessages(msg, person) {
        return __awaiter(this, void 0, void 0, function* () {
            let sms = msg.Body.trim();
            let sheets = yield sheets_1.default.getInstance(config_1.default.google);
            let calendar = yield calendar_1.default.getInstance(sheets);
            if (sms.match(/^schedule[.!]?$/i)) {
                yield calendar.scheduleTasks();
                return 'Ok, scheduling tasks';
            }
            return '';
        });
    }
    validateMessage(msg) {
        if (msg.AccountSid !== config_1.default.twilio.accountSid) {
            throw new Error('Whoops, Twilio needs to be configured.');
        }
        let [person] = this.sheets.people.filter(p => msg.From == p.phone);
        if (!person) {
            throw new Error('Sorry, I don’t know who you are.');
        }
        return person;
    }
    messageResponse(reply, response) {
        let rsp = new twilio_1.twiml.MessagingResponse();
        rsp.message(response);
        reply.header('Content-Type', 'text/xml');
        return rsp.toString();
    }
}
exports.default = SMS;
//# sourceMappingURL=sms.js.map