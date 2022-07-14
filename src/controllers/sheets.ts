import { GoogleSpreadsheet } from 'google-spreadsheet';
import { SheetsConfig, AssignmentUpdate } from '../types';
import { readFileSync } from 'fs';
import app from '../app';
import Calendar from './calendar';
import Person from '../models/person';
import Task from '../models/task';

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

	async updateAssignment(data: AssignmentUpdate) {
		this.validateSecret(data);
		let calendar = await Calendar.getInstance();
		let assignment = calendar.getAssignment(data.date, data.task);
		if (!assignment) {
			throw new Error('No matching assignment found');
		}
		assignment.time = data.time;
		assignment.person = data.person;
		assignment.status = data.status;
		app.log.info(
			`Updated '${assignment.task.toLowerCase()}' on ${assignment.date}`
		);
		return assignment;
	}

	validateSecret(data: AssignmentUpdate) {
		return data.secret && Sheets.config.webhookSecret == data.secret;
	}

	getActivePeople() {
		return this.people.filter(
			(p) => p.status == 'active' || p.status == 'backup'
		);
	}

	async currentBackup() {
		let [person] = this.people.filter((p) => p.status == 'backup');
		if (person) {
			return person;
		}
		// Nobody assigned yet, just pick the first person on the list
		let sheet = this.doc.sheetsByTitle['People'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			row.status = 'backup';
			await row.save();
			[person] = this.people.filter((p) => p.name == row.name);
			person.status = 'backup';
			return person;
		}
	}
}

export default Sheets;
