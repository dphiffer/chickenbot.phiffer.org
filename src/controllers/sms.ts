import { FastifyReply } from 'fastify';
import { SMSConfig, IncomingMessage, PersonContext } from '../types';
import { twiml } from 'twilio';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import twilio from 'twilio';
import * as moment from 'moment-timezone';

import Sheets from './sheets';
import Calendar from './calendar';
import Person from '../models/person';
import Assignment from '../models/assignment';
import app from '../app';

class SMS {
	private static config: SMSConfig;
	static instance: SMS;
	static yesReplies = [
		'y',
		'yes',
		'yep',
		'yeah',
		'yea',
		'indeed',
		'affirmative',
	];
	static noReplies = ['n', 'no', 'nope', 'nay', 'negative'];

	twilio: twilio.Twilio;
	phone: string;

	private constructor() {
		this.twilio = twilio(SMS.config.accountSid, SMS.config.authToken);
		this.phone = SMS.config.phone;
	}

	static configure(config: SMSConfig) {
		this.config = config;
	}

	static getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new SMS();
		return this.instance;
	}

	displayPhone(phone: string) {
		let area = phone.substring(2, 5);
		let prefix = phone.substring(5, 8);
		let postfix = phone.substring(8, 12);
		return `(${area}) ${prefix}-${postfix}`;
	}

	normalizeBody(msg: IncomingMessage) {
		return msg.Body.trim().toLowerCase().replace(/[!.]^/, '');
	}

	async handleMessage(person: Person, msg: IncomingMessage): Promise<string> {
		let rsp = '';
		if (person.context == PersonContext.ASSIGNMENT) {
			rsp = await this.handleAssignmentReply(msg, person);
		} else if (person.context == PersonContext.SCHEDULE_START) {
			rsp = await this.handleScheduleStartReply(msg, person);
		} else if (person.context == PersonContext.SCHEDULE_AWAY_DAYS) {
			rsp = await this.handleScheduleAwayDaysReply(msg, person);
		} else if (person.context == PersonContext.SCHEDULE_AWAY_FULL) {
			rsp = await this.handleScheduleAwayFullReply(msg, person);
		} else if (person.context == PersonContext.SCHEDULE_AWAY_TIME) {
			rsp = await this.handleScheduleAwayTimeReply(msg, person);
		} else if (person.context == PersonContext.SCHEDULE_AWAY_CONFIRM) {
			rsp = await this.handleScheduleAwayConfirmReply(msg, person);
		} else if (person.status == 'backup') {
			rsp = await this.handleBackupMessage(msg, person);
		} else {
			await this.relayToBackup(msg, person);
		}
		return rsp;
	}

	async handleBackupMessage(msg: IncomingMessage, backup: Person) {
		let sms = this.normalizeBody(msg);
		let namesRegex = await this.getNamesRegex();
		let announceRegex = this.getAnnounceRegex();
		let backupRegex = await this.getBackupRegex();
		let rsp = '';
		if (msg.Body.trim().toLowerCase() === 'schedule!') {
			await this.scheduleQuick();
		} else if (sms == 'schedule') {
			await this.scheduleStart();
		} else if (sms == 'announce') {
			await this.setAnnounceContext(backup);
		} else if (backup.context == PersonContext.ANNOUNCE) {
			rsp = await this.sendAnnouncement(msg, backup);
		} else if (sms.match(namesRegex)) {
			await this.relayToPerson(msg, backup);
		} else if (sms.match(announceRegex)) {
			rsp = await this.relayAnnouncement(msg, backup);
		} else if (sms.match(backupRegex)) {
			rsp = await this.reassignBackup(msg);
		} else if (backup.context == PersonContext.CHAT && backup.chatContext) {
			let media = await this.checkForMedia(msg, backup);
			if (msg.Body == '') {
				msg.Body = '📷';
			}
			await this.sendMessage(backup.chatContext, msg.Body, media);
		} else {
			rsp = `Sorry, I didn't understand that command.`;
		}
		return rsp;
	}

	async sendAssignments(due: Assignment[]) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let assignment of due) {
			let [person] = people.filter(p => p.name == assignment.person);
			let [task] = sheets.tasks.filter(t => t.name == assignment.task);
			if (!person || !task) {
				continue;
			}
			this.sendMessage(
				person,
				`Hi ${person.name}, ${task.question} [reply Y if you're done or Snooze for more time]`
			);
			person.assignment = assignment;
			person.context = PersonContext.ASSIGNMENT;
			await assignment.setPending();
		}
	}

	async handleAssignmentReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		if (!person.assignment) {
			throw new Error(
				`${person.name} replied in assignment context without an assignment`
			);
		}
		if (SMS.yesReplies.indexOf(sms) > -1) {
			await person.assignment.setDone();
			return Person.getAffirmation();
		} else if (sms == 'snooze') {
			let time = await person.assignment.snooze();
			return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
		}
		if (person.status == 'backup') {
			await this.handleBackupMessage(msg, person);
		} else {
			await this.relayToBackup(msg, person);
		}
		return '';
	}

	async scheduleStart() {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let person of people) {
			person.context = PersonContext.SCHEDULE_START;
			await this.sendMessage(
				person,
				'It is time to schedule chicken tasks. Are there any days you will be away this week? [reply Y or N]'
			);
		}
	}

	async scheduleQuick() {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let person of people) {
			person.context = PersonContext.READY;
		}
		await this.scheduleIfAllAreReady();
	}

	async handleScheduleStartReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let rsp = '';
		if (SMS.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_AWAY_DAYS;
			rsp =
				'Which days will you be away this week? [reply with comma-separated days: Mon, Tue or 6/17, 6/18]';
		} else if (SMS.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady();
		}
		return rsp;
	}

	async handleScheduleAwayDaysReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let days = sms.split(',');
		let isoDays = [];
		for (let day of days) {
			let isoDay = Calendar.parseDay(day);
			if (!isoDay) {
				return `Sorry I couldn't make sense of '${day}'. Please try again.`;
			}
			isoDays.push(isoDay);
		}
		let awayDays = await person.updateAway(isoDays);
		person.context = PersonContext.SCHEDULE_AWAY_FULL;
		return `Your current away days are: ${awayDays}\n\nWill you be away for the full day on all of those days? [Reply Y for full days or N to specify when you'll be away on each day]`;
	}

	async handleScheduleAwayFullReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let rsp = '';
		if (SMS.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_AWAY_TIME;
			person.scheduleDayIndex = 0;
			rsp = this.scheduleAwayTime(person);
		} else if (SMS.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady();
		} else {
			rsp = 'Sorry, please reply Y or N.';
		}
		return rsp;
	}

	scheduleAwayTime(person: Person) {
		let days = person.away.split(', ');
		let day = moment
			.default(days[person.scheduleDayIndex], 'YYYY-MM-DD')
			.format('ddd M/D');
		return `When will you be away on ${day}? [Reply AM for morning, PM for evening, or Full for the full day]`;
	}

	async handleScheduleAwayTimeReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let days = person.away.split(', ');
		if (sms == 'am' || sms == 'pm' || sms == 'full') {
			days[person.scheduleDayIndex] += ` ${sms}`;
			let awayDays = await person.updateAway(days);
			person.scheduleDayIndex++;
			if (person.scheduleDayIndex == days.length) {
				person.context = PersonContext.SCHEDULE_AWAY_CONFIRM;
				return `Thank you, here are your current away days: ${awayDays}\n\nDo those look right to you? [Reply Y or N]`;
			} else {
				return this.scheduleAwayTime(person);
			}
		} else {
			return 'Sorry, please reply with AM, PM, or Full.';
		}
	}

	async handleScheduleAwayConfirmReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let rsp = '';
		if (SMS.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_START;
			person.scheduleDayIndex = 0;
			rsp = `Ok, let's start over. Are there any days you will be away this week? [reply Y or N]`;
		} else if (SMS.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady();
		} else {
			rsp = 'Sorry, please reply Y or N.';
		}
		return rsp;
	}

	async scheduleIfAllAreReady() {
		let sheets = await Sheets.getInstance();
		let activePeople = sheets.getActivePeople();
		let readyPeople = activePeople.filter(
			p => p.context == PersonContext.READY
		);
		let allAreReady = activePeople.length == readyPeople.length;
		if (allAreReady) {
			let calendar = await Calendar.getInstance();
			calendar.scheduleTasks().then(this.scheduleSend.bind(this));
			return '';
		}
		return 'Thank you, I will send your schedule as soon as I hear back from everyone.';
	}

	async scheduleSend() {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let person of people) {
			if (person.schedule) {
				await this.sendMessage(person, person.schedule);
			}
		}
	}

	async setAnnounceContext(backup: Person) {
		if (backup.context == PersonContext.ANNOUNCE) {
			return;
		}
		await backup.setTemporaryContext(PersonContext.ANNOUNCE);
		await this.sendMessage(backup, '[Now announcing messages]');
	}

	async setChatContext(person: Person) {
		let sheets = await Sheets.getInstance();
		let backup = await sheets.currentBackup();
		if (!backup) {
			throw new Error('No backup found');
		}
		if (
			backup.context == PersonContext.CHAT &&
			backup.chatContext?.name == person.name
		) {
			return;
		}
		if (person.name == backup.name) {
			return;
		}
		await backup.setTemporaryContext(PersonContext.CHAT, person);
		await this.sendMessage(backup, `[Now chatting with ${person.name}]`);
	}

	async relayAnnouncement(msg: IncomingMessage, backup: Person) {
		let match = msg.Body.match(this.getAnnounceRegex());
		if (!match) {
			throw new Error('Could not match announce regex');
		}
		msg.Body = match[1];
		let response = await this.sendAnnouncement(msg, backup);
		return response;
	}

	async sendAnnouncement(msg: IncomingMessage, backup: Person) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		let count = 0;
		let media = await this.checkForMedia(msg, backup);
		if (media.length > 0 && msg.Body == '') {
			msg.Body = '📷';
		}
		for (let person of people) {
			if (person.status != 'backup') {
				await this.sendMessage(person, msg.Body, media);
				count++;
			}
		}
		return `Sent announcement to ${count} people: ${msg.Body}`;
	}

	async relayToBackup(msg: IncomingMessage, person: Person) {
		let sheets = await Sheets.getInstance();
		let backup = await sheets.currentBackup();
		let media = await this.checkForMedia(msg, person);
		if (!backup) {
			throw new Error('No backup found');
		}
		await this.sendMessage(backup, `${person.name}: ${msg.Body}`, media);
		await this.setChatContext(person);
	}

	checkForMedia(msg: IncomingMessage, person: Person): Promise<string[]> {
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

	downloadMedia(
		msg: IncomingMessage,
		person: Person,
		num: number
	): Promise<string> {
		return new Promise(async (resolve, reject) => {
			try {
				let root = path.dirname(path.dirname(__dirname));
				let date = moment.default().format(`YYYY-MM-DD`);
				let ext = '';
				if (msg[`MediaContentType${num}`] == 'image/jpeg') {
					ext = 'jpg';
				} else if (msg[`MediaContentType${num}`] == 'image/gif') {
					ext = 'gif';
				} else if (msg[`MediaContentType${num}`] == 'image/png') {
					ext = 'png';
				} else {
					throw new Error(
						`Unexpected image content-type: ${
							msg[`MediaContentType${num}`]
						}`
					);
				}
				let name = person.name.toLowerCase().replace(/\W+/g, '-');
				let fileNum = 0;
				let filename = `${root}/public/media/${date}-${name}-${fileNum}.${ext}`;
				while (fs.existsSync(filename)) {
					fileNum++;
					filename = `${root}/public/media/${date}-${name}-${fileNum}.${ext}`;
				}
				let publicPath = `/media/${date}-${name}-${fileNum}.${ext}`;
				let response = await axios({
					method: 'GET',
					url: msg[`MediaUrl${num}`],
					responseType: 'stream',
				});
				const pipe = response.data.pipe(fs.createWriteStream(filename));
				pipe.on('finish', () => {
					resolve(`${SMS.config.serverUrl}${publicPath}`);
				});
			} catch (err) {
				reject(err);
			}
		});
	}

	async relayErrorToBackup(
		msg: IncomingMessage,
		person: Person,
		error: Error
	) {
		msg.Body = error.message;
		if (person.status != 'backup') {
			msg.Body = `${person.name}: ${msg.Body}\n\n---\n${error.message}`;
		}
		await this.relayToBackup(msg, person);
	}

	async relayToPerson(msg: IncomingMessage, backup: Person) {
		let sheets = await Sheets.getInstance();
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

	async reassignBackup(msg: IncomingMessage) {
		let sheets = await Sheets.getInstance();
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
		let [newBackup] = sheets.people.filter(
			p => p.name.toLowerCase() == name.toLowerCase()
		);
		await currBackup.updateStatus('active');
		await newBackup.updateStatus('backup');
		await this.sendMessage(
			newBackup,
			`Hi ${newBackup.name}, ${currBackup.name} has made you the new designated backup.`
		);
		return `${newBackup.name} has been notified that they are now the designated backup.`;
	}

	async validateMessage(msg: IncomingMessage) {
		let sheets = await Sheets.getInstance();
		if (msg.AccountSid !== SMS.config.accountSid) {
			throw new Error('Whoops, Twilio needs to be configured.');
		}
		let [person] = sheets.people.filter(p => msg.From == p.phone);
		if (!person) {
			throw new Error('Sorry, I don’t know who you are.');
		}
		return person;
	}

	async sendMessage(person: Person, body: string, media: string[] = []) {
		app.log.info(`SMS to ${person.name}: ${body}`);
		await this.twilio.messages.create({
			from: this.phone,
			to: person.phone,
			body: body,
			mediaUrl: media,
		});
	}

	messageResponse(reply: FastifyReply, response: string) {
		let rsp = new twiml.MessagingResponse();
		rsp.message(response);
		reply.header('Content-Type', 'text/xml');
		return rsp.toString();
	}

	async getNamesRegex() {
		let sheets = await Sheets.getInstance();
		let names = sheets.getActivePeople().map(p => p.name);
		return new RegExp(`^(${names.join('|')}):\\s*(.+)$`, 'msi');
	}

	getAnnounceRegex() {
		return /announce:\s*(.+)$/ims;
	}

	async getBackupRegex() {
		let sheets = await Sheets.getInstance();
		let names = sheets.getActivePeople().map(p => p.name);
		return new RegExp(`^backup:\\s*(${names.join('|')})\\s*$`, 'msi');
	}
}

export default SMS;
