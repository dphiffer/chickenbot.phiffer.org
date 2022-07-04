import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import Sheets from '../sheets';

class Event {

	sheet: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;

	constructor(sheet: string, row: GoogleSpreadsheetRow) {
		this.sheet = sheet
		this.date = row.date;
		this.time = row.time;
		this.task = row.task;
        this.person = row.person;
		this.status = row.status;
	}
}

export default Event;
