import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import * as moment from 'moment-timezone';
import { AssignmentUpdate } from '../types';
import config from '../config';
import Sheets from '../sheets';

class Assignment {

	sheet: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;

	constructor(sheet: string, data: AssignmentUpdate) {
		this.sheet = sheet
		this.date = data.date;
		this.time = data.time;
		this.task = data.task;
        this.person = data.person;
		this.status = data.status;
	}

	async save() {
		let sheets = await Sheets.getInstance(config.google);
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

	async snooze() {
		this.status = 'scheduled';
		this.time = moment.default().add('1', 'hours').format('h:mm A');
		await this.save();
		return this.time;
	}
}

export default Assignment;
