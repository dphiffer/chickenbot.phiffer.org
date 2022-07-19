"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const twilio_1 = require("twilio");
const person_1 = __importDefault(require("../models/person"));
class Voice {
    constructor() {
        this.calls = {};
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
    setCall(sid, details) {
        this.calls[sid] = details;
    }
    async getResponse(sid) {
        let call = this.calls[sid];
        if (!call) {
            throw new Error(`Could not find call ${sid}`);
        }
        let rsp = this.say(`Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task or 2 to snooze the task if you need more time.`);
        rsp.gather({
            action: `${this.url}/call/${sid}`,
            numDigits: 1,
        });
        return rsp;
    }
    async postResponse(sid, digits) {
        let call = this.calls[sid];
        let rsp;
        if (!call) {
            throw new Error(`Could not find call ${sid}`);
        }
        if (digits == '1' && call.person.assignment) {
            let affirmation = person_1.default.getAffirmation(true);
            await call.person.assignment.setDone();
            rsp = this.say(affirmation);
        }
        else if (digits == '2' && call.person.assignment) {
            let time = await call.person.assignment.snooze();
            rsp = this.say(`Great, I'll ask again at ${time}. Goodbye!`);
        }
        else {
            rsp = this.say('Sorry, something went wrong.');
        }
        rsp.hangup();
        return rsp;
    }
    say(prompt) {
        let rsp = new twilio_1.twiml.VoiceResponse();
        rsp.say(prompt);
        return rsp;
    }
}
exports.default = Voice;
//# sourceMappingURL=voice.js.map