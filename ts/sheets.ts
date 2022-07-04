import { GoogleSpreadsheet } from 'google-spreadsheet';
import { SheetsConfig, EventUpdate } from './types';
import { readFileSync } from 'fs';
import Calendar from './calendar';
import Person from './models/person';
import Task from './models/task';

class Sheets {

    private static instance: Sheets;
    people: Person[] = [];
    tasks: Task[] = [];

    doc: GoogleSpreadsheet;
    webhookSecret: string;

    private constructor(config: SheetsConfig) {
        this.doc = new GoogleSpreadsheet(config.spreadsheetId);
        this.webhookSecret = config.webhookSecret;
    }

    static async getInstance(config: SheetsConfig) {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Sheets(config);
        let credsJson = readFileSync(config.credentials, 'utf-8');
        let creds = JSON.parse(credsJson);
        await this.instance.doc.useServiceAccountAuth(creds);
	    await this.instance.doc.loadInfo();
        console.log(`Initialized ${this.instance.doc.title}`);
        await this.instance.setup();
        return this.instance;
    }

    async setup() {
        await this.setupPeople();
        await this.setupTasks();
        return this;
    }

    async setupPeople() {
        let sheet = this.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            this.people.push(new Person(this, row));
        }
    }

    async setupTasks() {
        let sheet = this.doc.sheetsByTitle['Tasks'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            this.tasks.push(new Task(row));
        }
    }

    async updateEvent(data: EventUpdate) {
        if (data.secret != this.webhookSecret) {
            throw new Error('Webhook secret did not match');
        }
        let calendar = await Calendar.getInstance(this);
        let event = calendar.getEvent(data.date, data.task);
        if (! event) {
            throw new Error('No matching event found');
        }
        event.time = data.time;
        event.person = data.person;
        event.status = data.status;
        return event;
    }

    async currentBackup() {
		for (let person of this.people) {
			if (person.status == 'backup') {
				return person;
			}
		}
		// Nobody assigned yet, just pick the first person on the list
		let sheet = this.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			row.status = 'backup';
			await row.save();
			this.people[row.name].status = 'backup';
			return this.people[row.name];
		}
	}
    
}

export default Sheets;