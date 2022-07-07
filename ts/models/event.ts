import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import Sheets from '../sheets';

class Event {

	sheet: string;
    date: string;
    time: string;
    task: string;
    person: string;
    status: string;

	constructor(sheet: string, data: any) {
		this.sheet = sheet
		this.date = data.date;
		this.time = data.time;
		this.task = data.task;
        this.person = data.person;
		this.status = data.status;
	}
}

export default Event;
