import { GoogleSpreadsheet } from 'google-spreadsheet';
import { SheetsConfig } from '../app';
import { WebhookUpdate } from '../routes';
import { AssignmentUpdate } from '../models/assignment';
import { PersonUpdate, PersonStatus } from '../models/person';
import { readFileSync } from 'fs';
import Calendar from './calendar';
import Person from '../models/person';
import Task from '../models/task';
import app from '../app';
import Messages from './messages';

class Sheets {
	private static config: SheetsConfig;
	private static instance: Sheets;

	people: Person[] = [];
	tasks: Task[] = [];

	doc: GoogleSpreadsheet;
	webhookSecret: string;

	private constructor() {
		this.doc = new GoogleSpreadsheet(Sheets.config.spreadsheetId);
		this.webhookSecret = Sheets.config.webhookSecret;
	}

	static configure(config: SheetsConfig) {
		this.config = config;
	}

	static async getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Sheets();
		return this.instance;
	}

	get id() {
		return Sheets.config.spreadsheetId;
	}

	async setup() {
		let credsJson = readFileSync(Sheets.config.credentials, 'utf-8');
		let creds = JSON.parse(credsJson);
		await this.doc.useServiceAccountAuth(creds);
		await this.doc.loadInfo();
		app.log.info(`Loading '${this.doc.title}'`);
		let people = await this.loadPeople();
		let active = this.getActivePeople();
		app.log.info(
			`Loaded ${people.length} people (${active.length} are active)`
		);
		let tasks = await this.loadTasks();
		app.log.info(`Loaded ${tasks.length} tasks`);
		return this;
	}

	async loadPeople() {
		this.people = [];
		let sheet = this.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.people.push(new Person(this, row));
		}
		return this.people;
	}

	async loadTasks() {
		this.tasks = [];
		let sheet = this.doc.sheetsByTitle['Tasks'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.tasks.push(new Task(row));
		}
		return this.tasks;
	}

	async updateFromWebhook(data: WebhookUpdate) {
		app.log.info(data);
		this.validateSecret(data);
		let updated;
		if (data.assignment) {
			updated = await this.updateAssignment(data.assignment);
		} else if (data.person) {
			updated = await this.updatePerson(data.person);
		}
		return updated;
	}

	async updateAssignment(data: AssignmentUpdate) {
		let calendar = await Calendar.getInstance();
		let assignment = calendar.getAssignment(data.date, data.task);
		if (!assignment) {
			throw new Error('No matching assignment found');
		}
		let previousPerson: string = '';
		if (assignment.person != data.person) {
			previousPerson = assignment.person;
		}
		assignment.time = data.time;
		assignment.person = data.person;
		assignment.status = data.status;
		app.log.info(
			`Updated '${assignment.task.toLowerCase()}' on ${assignment.date}`
		);
		let messages = Messages.getInstance();
		if (messages.isScheduling && previousPerson) {
			let [person] = this.people.filter(p => p.name == data.person);
			if (person) {
				let assigned = calendar.assignments.filter(
					a => a.person == data.person
				);
				person.setSchedule(assigned);
				app.log.info(`Updated schedule for ${data.person}`);
			}
			[person] = this.people.filter(p => p.name == previousPerson);
			if (person) {
				let assigned = calendar.assignments.filter(
					a => a.person == previousPerson
				);
				person.setSchedule(assigned);
				app.log.info(`Updated schedule for ${previousPerson}`);
			}
		}
		return assignment;
	}

	async updatePerson(data: PersonUpdate) {
		let [person] = this.people.filter(p => p.name == data.name);
		if (!person) {
			throw new Error(`Person '${data.name}' not found.`);
		}
		person.phone = person.normalizePhone(data.phone);
		person.status = data.status;
		person.away = data.away;
		app.log.info(`Updated '${person.name}'`);
		return person;
	}

	validateSecret(data: WebhookUpdate) {
		return data.secret && Sheets.config.webhookSecret == data.secret;
	}

	getActivePeople() {
		return this.people.filter(p => p.status != PersonStatus.INACTIVE);
	}

	async currentBackup() {
		let [person] = this.people.filter(p => p.status == PersonStatus.BACKUP);
		if (person) {
			return person;
		}
		// Nobody assigned yet, just pick the first person on the list
		let sheet = this.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			row.status = PersonStatus.BACKUP;
			await row.save();
			[person] = this.people.filter(p => p.name == row.name);
			person.status = PersonStatus.BACKUP;
			return person;
		}
	}
}

export default Sheets;
