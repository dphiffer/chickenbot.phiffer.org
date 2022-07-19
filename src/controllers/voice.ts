import { twiml } from 'twilio';
import { TwilioConfig } from '../app';
import Person from '../models/person';
import Task from '../models/task';

export interface CallDetails {
	person: Person;
	task: Task;
}

class Voice {
	private static instance: Voice;
	private static config: TwilioConfig;

	private calls: { [sid: string]: CallDetails } = {};
	url: string;

	private constructor() {
		this.url = Voice.config.serverUrl;
	}

	static getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Voice();
		return this.instance;
	}

	static configure(config: TwilioConfig) {
		this.config = config;
	}

	setCall(sid: string, details: CallDetails) {
		this.calls[sid] = details;
	}

	async getResponse(sid: string) {
		let call = this.calls[sid];
		if (!call) {
			throw new Error(`Could not find call ${sid}`);
		}
		let rsp = this.say(
			`Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task or 2 to snooze the task if you need more time.`
		);
		rsp.gather({
			action: `${this.url}/call/${sid}`,
			numDigits: 1,
		});
		return rsp;
	}

	async postResponse(sid: string, digits: string) {
		let call = this.calls[sid];
		let rsp;
		if (!call) {
			throw new Error(`Could not find call ${sid}`);
		}
		if (digits == '1' && call.person.assignment) {
			let affirmation = Person.getAffirmation(true);
			await call.person.assignment.setDone();
			rsp = this.say(affirmation);
		} else if (digits == '2' && call.person.assignment) {
			let time = await call.person.assignment.snooze();
			rsp = this.say(`Great, I'll ask again at ${time}. Goodbye!`);
		} else {
			rsp = this.say('Sorry, something went wrong.');
		}
		rsp.hangup();
		return rsp;
	}

	say(prompt: string) {
		let rsp = new twiml.VoiceResponse();
		rsp.say(prompt);
		return rsp;
	}
}

export default Voice;
