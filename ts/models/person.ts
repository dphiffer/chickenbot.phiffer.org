import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import moment from 'moment-timezone';
import Sheets from '../sheets';

class Person {

	sheets: Sheets;
	name: string;
	phone: string;
	status: string;
	away: string;
	assigned: string = "";

	constructor(sheets: Sheets, row: GoogleSpreadsheetRow) {
		this.sheets = sheets;
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
			'❤️🐔❤️'
		];
		let index = Math.floor(Math.random() * affirmations.length);
		return affirmations[index];
	}

	async updateStatus(status: string) {
		this.status = status;
		let sheet = this.sheets.doc.sheetsByTitle['People'];
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
		awayDays = awayDays.filter(date => {
			return date >= moment().format('YYYY-MM-DD');
		});
		this.away = awayDays.join(', ');
		let sheet = this.sheets.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			if (row.name == this.name) {
				row.away = this.away;
				await row.save();
				break;
			}
		}
		return awayDays.map(date => {
			return moment(date, 'YYYY-MM-DD').format('ddd M/D');
		}).join(', ');
	}

	isAway(date: string) {
		let awayDays = this.away.split(', ');
		if (awayDays.indexOf(date) > -1) {
			return true;
		}
		return false;
	}
}

export default Person;
