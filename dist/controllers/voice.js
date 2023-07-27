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
const twilio_1 = __importStar(require("twilio"));
const assignment_1 = require("../models/assignment");
const app_1 = __importDefault(require("../app"));
const person_1 = __importDefault(require("../models/person"));
const sheets_1 = __importDefault(require("./sheets"));
const messages_1 = __importDefault(require("./messages"));
class Voice {
    constructor() {
        this.calls = {};
        this.twilio = (0, twilio_1.default)(Voice.config.accountSid, Voice.config.authToken);
        this.phone = Voice.config.phone;
        this.url = Voice.config.serverUrl;
    }
    static getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Voice();
        return this.instance;
    }
    static configure(config) {
        this.config = config;
    }
    async call(person) {
        if (!person.assignment) {
            throw new Error(`Could not find assignment for ${person.name}`);
        }
        app_1.default.log.warn(`Calling ${person.name}...`);
        let assignment = person.assignment;
        let sheets = await sheets_1.default.getInstance();
        let [task] = sheets.tasks.filter(t => t.name == assignment.task);
        if (!task) {
            throw new Error(`Could not find task for ${person.name}`);
        }
        this.calls[person.phone] = {
            person: person,
            assignment: assignment,
            task: task,
        };
        await this.twilio.calls.create({
            url: `${this.url}/call/${person.phone}`,
            statusCallback: `${this.url}/call/${person.phone}/status`,
            to: person.phone,
            from: this.phone,
        });
    }
    async handlePrompt(phone) {
        let call = this.calls[phone];
        if (!call) {
            throw new Error(`Could not find call for ${phone}`);
        }
        let message = `Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.`;
        app_1.default.log.warn(`Saying: ${message}`);
        let rsp = this.say(message);
        rsp.gather({
            action: `${this.url}/call/${phone}/response`,
            numDigits: 1,
        });
        return rsp.toString();
    }
    async handleResponse(phone, digits) {
        let call = this.calls[phone];
        let rsp;
        if (!call) {
            throw new Error(`Could not find call for ${phone}`);
        }
        if (!call.assignment) {
            throw new Error(`Could not find assignment for ${phone}`);
        }
        if (digits == '1') {
            let affirmation = person_1.default.getAffirmation(true);
            app_1.default.log.warn(`Task is done. Saying: ${affirmation}`);
            await call.assignment.setDone();
            rsp = this.say(affirmation);
            rsp.say('Goodbye!');
            rsp.hangup();
        }
        else if (digits == '2') {
            let time = await call.assignment.snooze();
            let message = `Great, I'll ask again at ${time}.`;
            rsp = this.say(message);
            app_1.default.log.warn(`Snoozing task. Saying: ${message}`);
            rsp.say('Goodbye!');
            rsp.hangup();
        }
        else {
            let message = 'Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.';
            app_1.default.log.warn(`Invalid input: ${digits}. Saying: ${message}`);
            rsp = this.say(message);
            rsp.gather({
                action: `${this.url}/call/${phone}/response`,
                numDigits: 1,
            });
        }
        return rsp.toString();
    }
    handleStatus(phone, status) {
        let call = this.calls[phone];
        if (!call) {
            throw new Error(`Could not find call for ${phone}`);
        }
        if (call.assignment.status == assignment_1.AssignmentStatus.PENDING) {
            let messages = messages_1.default.getInstance();
            messages.sendAssignment(call.person, call.assignment);
        }
    }
    say(prompt) {
        let rsp = new twilio_1.twiml.VoiceResponse();
        rsp.say(prompt);
        return rsp;
    }
}
exports.default = Voice;
//# sourceMappingURL=voice.js.map