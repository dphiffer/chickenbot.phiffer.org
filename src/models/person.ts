import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import { PersonContext } from '../types';
import moment from 'moment-timezone';
import Sheets from '../controllers/sheets';
import Assignment from './assignment';
import { clearTimeout } from 'timers';
import { log } from '../log';

class Person {
	name: string;
	phone: string;
	status: string;
	away: string;
	schedule: null | string = null;
	assignment: null | Assignment = null;
	context: PersonContext = PersonContext.READY;
	chatContext: null | Person = null;
	contextTimeout: null | NodeJS.Timeout = null;
	scheduleDayIndex: number = 0;

	constructor(sheets: Sheets, row: GoogleSpreadsheetRow) {
		this.name = row.name;
		this.phone = this.normalizePhone(row.phone);
		this.status = row.status;
		this.away = row.away || '';
	}

	normalizePhone(phone: string) {
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
			'❤️🐔❤️',
		];
		let index = Math.floor(Math.random() * affirmations.length);
		return affirmations[index];
	}

	async updateStatus(status: string) {
		let sheets = await Sheets.getInstance();
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

	async updateAway(awayDays: string[]) {
		this.away = awayDays.join(', ');
		let sheets = await Sheets.getInstance();
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
				} else if (date.match(/ pm$/)) {
					date = date.replace(/ pm$/, '');
					suffix = ' (evening)';
				} else if (date.match(/ full$/)) {
					date = date.replace(/ full$/, '');
					suffix = ' (full day)';
				}
				return moment(date, 'YYYY-MM-DD').format('ddd M/D') + suffix;
			})
			.join(', ');
	}

	isAway(date: string, time: string) {
		let awayDays = this.away.split(', ');
		if (awayDays.indexOf(date) > -1) {
			return true;
		}
		for (let day of awayDays) {
			let regex = new RegExp(`^${date} (am|pm|full)$`);
			let match = day.match(regex);
			if (match) {
				let taskTime = moment(
					`${date} ${time}`,
					'YYYY-MM-DD h:mm A'
				).format('YYYY-MM-DD HH:mm');
				if (match[1] == 'am') {
					let awayStart = `${date} 00:00`;
					let awayEnd = `${date} 12:00`;
					if (taskTime >= awayStart && taskTime <= awayEnd) {
						return true;
					}
				} else if (match[1] == 'pm') {
					let awayStart = `${date} 12:00`;
					let awayEnd = `${date} 23:59`;
					if (taskTime >= awayStart && taskTime <= awayEnd) {
						return true;
					}
				} else if (match[1] == 'full') {
					return true;
				}
			}
		}
		return false;
	}

	async setTemporaryContext(
		context: PersonContext,
		chatContext: null | Person = null
	) {
		log(`Setting ${this.name}'s temporary context to '${context}'`);
		this.context = context;
		if (chatContext) {
			this.chatContext = chatContext;
		}
		if (this.contextTimeout) {
			clearTimeout(this.contextTimeout);
		}
		this.contextTimeout = setTimeout(() => {
			log(`Resetting ${this.name}'s context to '${PersonContext.READY}'`);
			if (this.context == context) {
				this.context = PersonContext.READY;
			}
			this.chatContext = null;
			this.contextTimeout = null;
		}, 60 * 60 * 1000);
	}
}

export default Person;
