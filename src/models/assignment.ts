import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import * as moment from 'moment-timezone';
import Sheets from '../controllers/sheets';
import Messages from '../controllers/messages';

export interface AssignmentUpdate {
	date: string;
	time: string;
	task: string;
	person: string;
	status: AssignmentStatus;
}

export enum AssignmentStatus {
	SCHEDULED = 'scheduled',
	PENDING = 'pending',
	DONE = 'done',
}

class Assignment {
	sheet: string;
	date: string;
	time: string;
	task: string;
	person: string;
	status: AssignmentStatus;

	timeout: NodeJS.Timeout | null = null;

	constructor(sheet: string, data: AssignmentUpdate) {
		this.sheet = sheet;
		this.date = data.date;
		this.time = data.time;
		this.task = data.task;
		this.person = data.person;
		this.status = data.status;
	}

	get isoDate() {
		return moment.default(this.date, 'M/D').format('YYYY-MM-DD');
	}

	async setPending() {
		this.status = AssignmentStatus.PENDING;
		await this.save();
		this.timeout = setTimeout(async () => {
			let messages = Messages.getInstance();
			let sheets = await Sheets.getInstance();
			let backup = await sheets.currentBackup();
			if (backup) {
				messages.sendMessage(
					backup,
					`Still pending after one hour: ${this.task}, assigned to ${this.person}.`
				);
			}
		}, 60 * 60 * 1000);
	}

	async setDone() {
		this.status = AssignmentStatus.DONE;
		this.time = moment.default().format('h:mm A');
		await this.save();
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	async snooze() {
		this.status = AssignmentStatus.SCHEDULED;
		this.time = moment.default().add('1', 'hours').format('h:mm A');
		await this.save();
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		return this.time;
	}

	async save() {
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle[this.sheet];
		let rows = await sheet.getRows();
		let id = `${this.date} ${this.task}`;
		for (let row of rows) {
			if (id == `${row.date} ${row.task}`) {
				row.time = this.time;
				row.person = this.person;
				row.status = this.status;
				await row.save();
			}
		}
	}
}

export default Assignment;
