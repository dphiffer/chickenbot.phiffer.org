import { GoogleSpreadsheetRow } from 'google-spreadsheet';

class Task {
	name: string;
	question: string;
	frequency: number;
	time: string;

	lastRun: string | null = null;
	lastPerson: string | null = null;
	nextRun: string | null = null;

	constructor(row: GoogleSpreadsheetRow) {
		this.name = row.name;
		this.question = row.question;
		this.frequency = parseInt(row.frequency);
		this.time = row.time;
	}
}

export default Task;
