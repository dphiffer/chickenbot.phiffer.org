"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const twilio_1 = require("twilio");
const twilio_2 = __importDefault(require("twilio"));
const assignment_1 = require("../models/assignment");
const person_1 = __importDefault(require("../models/person"));
const sheets_1 = __importDefault(require("./sheets"));
const messages_1 = __importDefault(require("./messages"));
class Voice {
    constructor() {
        this.calls = {};
        this.twilio = (0, twilio_2.default)(Voice.config.accountSid, Voice.config.authToken);
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
        let rsp = this.say(`Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.`);
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
        if (digits == '1' && call.assignment) {
            let affirmation = person_1.default.getAffirmation(true);
            await call.assignment.setDone();
            rsp = this.say(affirmation);
        }
        else if (digits == '2' && call.assignment) {
            let time = await call.assignment.snooze();
            rsp = this.say(`Great, I'll ask again at ${time}.`);
        }
        else {
            rsp = this.say('Sorry, something went wrong.');
        }
        rsp.say('Goodbye!');
        rsp.hangup();
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