import { FastifyReply } from 'fastify';
import { TwilioConfig } from '../app';
import { IncomingMessage } from '../routes';
import { PersonContext, PersonStatus } from '../models/person';
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

interface PendingMessage {
	sid: string;
	person: Person;
	body: string;
	media: string[];
	created: Date;
	status: string;
}

export default class Messages {
	private static config: TwilioConfig;
	static pendingMessages: PendingMessage[] = [];
	static instance: Messages;
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
	isScheduling: boolean = false;
	scheduleLength: number = 7;

	private constructor() {
		this.twilio = twilio(
			Messages.config.accountSid,
			Messages.config.authToken
		);
		this.phone = Messages.config.phone;
	}

	static configure(config: TwilioConfig) {
		this.config = config;
	}

	static getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Messages();
		return this.instance;
	}

	static getPendingSummary() {
		if (Messages.pendingMessages.length == 0) {
			return '';
		} else {
			return ` (${Messages.pendingMessages.length} pending messages)`;
		}
	}

	static async updatePendingMessage(sid: string, status: string) {
		if (status == 'delivered') {
			app.log.warn(`Delivered SMS ${sid}`);
			Messages.pendingMessages = Messages.pendingMessages.filter(
				msg => msg.sid != sid
			);
		} else if (status == 'undelivered') {
			app.log.warn(`Resending undelivered SMS ${sid}...`);
			for (let msg of Messages.pendingMessages) {
				if (msg.sid == sid) {
					await Messages.getInstance().sendMessage(
						msg.person,
						msg.body,
						msg.media
					);
					Messages.pendingMessages = Messages.pendingMessages.filter(
						msg => msg.sid != sid
					);
					break;
				}
			}
		} else {
			for (let i = 0; i < Messages.pendingMessages.length; i++) {
				let msg = Messages.pendingMessages[i];
				if (msg.sid == sid) {
					Messages.pendingMessages[i].status = status;
					break;
				}
			}
		}
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
		} else if (this.normalizeBody(msg) == 'login') {
			rsp = await this.handleLoginMessage(msg, person);
		} else if (person.status == PersonStatus.BACKUP) {
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
		app.log.warn(`Current context: ${backup.context}`);
		if (sms.startsWith('schedule')) {
			await this.scheduleStart(sms);
		} else if (sms == 'announce') {
			await this.setAnnounceContext(backup);
		} else if (sms == 'ready') {
			rsp = await this.setReadyContext(backup);
		} else if (backup.context == PersonContext.SCHEDULE_SEND) {
			rsp = await this.handleScheduleSendReply(msg, backup);
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

	async sendAssignment(person: Person, assignment: Assignment) {
		let sheets = await Sheets.getInstance();
		let [task] = sheets.tasks.filter(t => t.name == assignment.task);
		if (!task) {
			throw new Error(`Could not find task ${assignment.task}`);
		}
		this.sendMessage(
			person,
			`Hi ${person.name}, ${task.question} [reply Y if you're done or Snooze for more time]`
		);
	}

	async handleAssignmentReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		if (!person.assignment) {
			throw new Error(
				`${person.name} replied in assignment context without an assignment`
			);
		}
		if (Messages.yesReplies.indexOf(sms) > -1) {
			await person.assignment.setDone();
			return Person.getAffirmation();
		} else if (sms == 'snooze') {
			let time = await person.assignment.snooze();
			return `Great, I'll ask again at ${time}. [reply Y at any time once you're done]`;
		}
		if (person.status == PersonStatus.BACKUP) {
			await this.handleBackupMessage(msg, person);
		} else {
			await this.relayToBackup(msg, person);
		}
		return '';
	}

	async scheduleStart(sms: string) {
		this.isScheduling = true;
		this.scheduleLength = 7;
		let lengthMatch = sms.match(/^schedule (\d+)/);
		if (lengthMatch) {
			this.scheduleLength = parseInt(lengthMatch[1]);
		}
		let quickSchedule = sms.endsWith('!');
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		let calendar = await Calendar.getInstance();
		let weekDates = calendar.getScheduleDates(this.scheduleLength);
		for (let person of people) {
			if (quickSchedule) {
				person.context = PersonContext.READY;
			} else if (person.status != PersonStatus.VACATION) {
				person.context = PersonContext.SCHEDULE_START;
				await this.sendMessage(
					person,
					`Hi ${person.name}, it is time to schedule chicken tasks. Are there any days you will be away ${weekDates}? [reply Y or N]`
				);
			}
		}
		if (quickSchedule) {
			this.scheduleIfAllAreReady();
			return 'Creating a quick schedule.';
		}
	}

	async handleScheduleStartReply(msg: IncomingMessage, person: Person) {
		let sms = this.normalizeBody(msg);
		let rsp = '';
		if (Messages.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_AWAY_DAYS;
			rsp =
				'Which days will you be away this week? [reply with comma-separated days: Mon, Tue or 6/17, 6/18]';
		} else if (Messages.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady(person);
		} else {
			rsp = 'Sorry, please reply with Y or N.';
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
				return `Sorry I couldn't make sense of '${day.trim()}'. Please try again.`;
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
		if (Messages.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_AWAY_TIME;
			person.scheduleDayIndex = 0;
			rsp = this.scheduleAwayTime(person);
		} else if (Messages.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady(person);
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
		if (Messages.noReplies.indexOf(sms) > -1) {
			person.context = PersonContext.SCHEDULE_START;
			person.scheduleDayIndex = 0;
			rsp = `Ok, let's start over. Are there any days you will be away this week? [reply Y or N]`;
		} else if (Messages.yesReplies.indexOf(sms) > -1) {
			person.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady(person);
		} else {
			rsp = 'Sorry, please reply Y or N.';
		}
		return rsp;
	}

	async scheduleIfAllAreReady(person: null | Person = null) {
		let sheets = await Sheets.getInstance();
		let active = sheets.getActivePeople();
		let notReady: string[] = [];
		active.forEach(p => {
			if (p.context != PersonContext.READY) {
				if (p.status == PersonStatus.BACKUP) {
					notReady.push('you');
				} else {
					notReady.push(p.name);
				}
			}
		});
		let allAreReady = notReady.length == 0;
		if (person && person.status != PersonStatus.BACKUP) {
			let waiting = allAreReady
				? ''
				: ` Still waiting on: ${notReady.join(', ')}`;
			let backup = await sheets.currentBackup();
			if (backup) {
				this.sendMessage(
					backup,
					`${person.name} is ready to schedule tasks.${waiting}`
				);
			}
		}
		if (allAreReady) {
			let calendar = await Calendar.getInstance();
			calendar.scheduleTasks(this.scheduleLength).then(async () => {
				let backup = await sheets.currentBackup();
				if (backup) {
					backup.context = PersonContext.SCHEDULE_SEND;
					this.sendMessage(
						backup,
						'Assignment schedules have been created, send them out? [Reply Y or N]'
					);
				}
			});
			return '';
		}
		return 'Thank you, I will send your schedule as soon as I hear back from everyone.';
	}

	async handleScheduleSendReply(msg: IncomingMessage, backup: Person) {
		let sms = this.normalizeBody(msg);
		if (Messages.yesReplies.indexOf(sms) > -1) {
			this.scheduleSend();
			this.isScheduling = false;
			backup.context = PersonContext.READY;
			return 'Great, I will send schedules out now.';
		} else if (Messages.noReplies.indexOf(sms) > -1) {
			backup.context = PersonContext.READY;
			return `Not sending. You can remake the schedule with 'schedule!' (the exclamation point skips the process of asking when people are away).`;
		} else {
			return 'Sorry, please respond Y or N.';
		}
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

	async handleLoginMessage(msg: IncomingMessage, person: Person) {
		let code = person.getLoginCode();
		let loginURL = `${Messages.config.serverUrl}/login/${code}`;
		return `Please follow this link within 15 minutes to complete your login: ${loginURL}`;
	}

	async setAnnounceContext(backup: Person) {
		if (backup.context == PersonContext.ANNOUNCE) {
			return;
		}
		await backup.setTemporaryContext(PersonContext.ANNOUNCE, () => {
			this.sendMessage(backup, '[Done announcing messages]');
		});
		await this.sendMessage(backup, '[Now announcing messages]');
	}

	async setReadyContext(backup: Person) {
		let rsp = '';
		if (this.isScheduling) {
			backup.context = PersonContext.READY;
			rsp = await this.scheduleIfAllAreReady();
		} else if (
			backup.context == PersonContext.ANNOUNCE ||
			backup.context == PersonContext.CHAT
		) {
			rsp = '[Resetting temporary context]';
		} else if (backup.context == PersonContext.ASSIGNMENT) {
			rsp = '[Abandoning assignment]';
		} else {
			rsp = '[You are ready]';
		}
		backup.context = PersonContext.READY;
		return rsp;
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
		let onExpire = async () => {
			if (backup) {
				await this.sendMessage(
					backup,
					`[Done chatting with ${person.name}]`
				);
			}
		};
		await backup.setTemporaryContext(PersonContext.CHAT, onExpire, person);
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
			if (
				person.status != PersonStatus.BACKUP &&
				person.status != PersonStatus.VACATION
			) {
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
					resolve(`${Messages.config.serverUrl}${publicPath}`);
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
		if (person.status != PersonStatus.BACKUP) {
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
		await currBackup.updateStatus(PersonStatus.ACTIVE);
		await newBackup.updateStatus(PersonStatus.BACKUP);
		await this.sendMessage(
			newBackup,
			`Hi ${newBackup.name}, ${currBackup.name} has made you the new designated backup.`
		);
		return `${newBackup.name} has been notified that they are now the designated backup.`;
	}

	async validateMessage(msg: IncomingMessage) {
		let sheets = await Sheets.getInstance();
		if (msg.AccountSid !== Messages.config.accountSid) {
			throw new Error('Whoops, Twilio needs to be configured.');
		}
		let [person] = sheets.people.filter(p => msg.From == p.phone);
		if (!person) {
			throw new Error('Sorry, I don’t know who you are.');
		}
		return person;
	}

	async sendMessage(person: Person, body: string, media: string[] = []) {
		let message = await this.twilio.messages.create({
			from: this.phone,
			to: person.phone,
			body: body,
			mediaUrl: media,
			statusCallback: `${Messages.config.serverUrl}/message/status`,
		});
		app.log.warn(`SMS to ${person.name}: ${body} (SID ${message.sid})`);
		Messages.pendingMessages.push({
			sid: message.sid,
			person: person,
			body: body,
			media: media,
			created: new Date(),
			status: 'pending',
		});
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
