import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import Sheets from '../sheets';

class Task {

	name: string;
	question: string;
	frequency: number;
	time: string;

	constructor(row: GoogleSpreadsheetRow) {
		this.name = row.name;
		this.question = row.question;
		this.frequency = parseInt(row.frequency);
		this.time = row.time;
	}
}

export default Task;
