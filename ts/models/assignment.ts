import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import * as moment from 'moment-timezone';
import { AssignmentUpdate } from '../types';
import Sheets from '../controllers/sheets';
import SMS from '../controllers/sms';

class Assignment {

	sheet: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;
	
	timeout: NodeJS.Timeout | null = null;

	constructor(sheet: string, data: AssignmentUpdate) {
		this.sheet = sheet
		this.date = data.date;
		this.time = data.time;
		this.task = data.task;
        this.person = data.person;
		this.status = data.status;
	}

	async setPending() {
		this.status = 'pending';
		await this.save();
		this.timeout = setTimeout(async () => {
			let sms = SMS.getInstance();
			let sheets = await Sheets.getInstance();
			let backup = await sheets.currentBackup();
			if (backup) {
				sms.sendMessage(backup, `${this.task}, assigned to ${this.person}, is still pending after one hour.`);
			}
		}, 60 * 1000);
	}

	async setDone() {
		this.status = 'done';
		this.time = moment.default().format('h:mm A');
		await this.save();
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	async snooze() {
		this.status = 'scheduled';
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
