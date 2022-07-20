import { Twilio, twiml } from 'twilio';
import { TwilioConfig } from '../app';
import twilio from 'twilio';
import Assignment from '../models/assignment';
import Person from '../models/person';
import Task from '../models/task';
import Sheets from './sheets';
import Messages from './messages';

export interface CallDetails {
	person: Person;
	assignment: Assignment;
	task: Task;
}

class Voice {
	private static instance: Voice;
	private static config: TwilioConfig;

	private calls: { [phone: string]: CallDetails } = {};
	twilio: Twilio;
	phone: string;
	url: string;

	private constructor() {
		this.twilio = twilio(Voice.config.accountSid, Voice.config.authToken);
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

	static configure(config: TwilioConfig) {
		this.config = config;
	}

	async call(person: Person) {
		if (!person.assignment) {
			throw new Error(`Could not find assignment for ${person.name}`);
		}
		let assignment = person.assignment;
		let sheets = await Sheets.getInstance();
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

	async handlePrompt(phone: string) {
		let call = this.calls[phone];
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		let rsp = this.say(
			`Hello ${call.person.name}, ${call.task.question} Please press 1 if you are done with the task. Press 2 to snooze the task if you need more time.`
		);
		rsp.gather({
			action: `${this.url}/call/${phone}/response`,
			numDigits: 1,
		});
		return rsp.toString();
	}

	async handleResponse(phone: string, digits: string) {
		let call = this.calls[phone];
		let rsp;
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		if (digits == '1' && call.assignment) {
			let affirmation = Person.getAffirmation(true);
			await call.assignment.setDone();
			rsp = this.say(affirmation);
		} else if (digits == '2' && call.assignment) {
			let time = await call.assignment.snooze();
			rsp = this.say(`Great, I'll ask again at ${time}.`);
		} else {
			rsp = this.say('Sorry, something went wrong.');
		}
		rsp.say('Goodbye!');
		rsp.hangup();
		return rsp.toString();
	}

	handleStatus(phone: string, status: string) {
		let call = this.calls[phone];
		if (!call) {
			throw new Error(`Could not find call for ${phone}`);
		}
		if (call.assignment.status == 'pending') {
			let messages = Messages.getInstance();
			messages.sendAssignment(call.person, call.assignment);
		}
	}

	say(prompt: string) {
		let rsp = new twiml.VoiceResponse();
		rsp.say(prompt);
		return rsp;
	}
}

export default Voice;
