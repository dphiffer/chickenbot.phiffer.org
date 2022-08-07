import { GoogleSpreadsheetRow } from 'google-spreadsheet';
import * as moment from 'moment-timezone';
import * as suntimes from 'suntimes';
import { CalendarConfig } from '../app';
import { PersonContext, PersonStatus } from '../models/person';
import { AssignmentUpdate } from '../models/assignment';
import Sheets from './sheets';
import Person from '../models/person';
import Task from '../models/task';
import Assignment, { AssignmentStatus } from '../models/assignment';
import Messages from './messages';
import Voice from './voice';
import app from '../app';

class Calendar {
	private static config: CalendarConfig;
	private static instance: Calendar;

	timezone: string;
	latitude: number;
	longitude: number;

	assignments: Assignment[] = [];
	queue: string[] = [];
	index: number = 0;

	private constructor() {
		this.timezone = Calendar.config.timezone;
		this.latitude = Calendar.config.latitude;
		this.longitude = Calendar.config.longitude;
		moment.tz.setDefault(Calendar.config.timezone);
	}

	static configure(config: CalendarConfig) {
		this.config = config;
	}

	static async getInstance() {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Calendar();
		return this.instance;
	}

	static parseDay(input: string) {
		let today = moment.default().format('YYYY-MM-DD');
		input = input.trim();
		let formats = ['dd', 'ddd', 'dddd', 'M/D', 'YYYY-MM-DD'];
		for (let format of formats) {
			if (format == 'M/D' && input.indexOf('/') == -1) {
				continue;
			} else if (
				format == 'YYYY-MM-DD' &&
				!input.match(/^\d{4}-\d{2}-\d{2}$/)
			) {
				continue;
			}
			if (moment.default(input, format).isValid()) {
				let day = moment.default(input, format);
				if (day.format('YYYY-MM-DD') > today) {
					return day.format('YYYY-MM-DD');
				}
				if (
					day.format('YYYY-MM-DD') == today ||
					format == 'YYYY-MM-DD'
				) {
					return false;
				} else if (format == 'M/D') {
					day.add(1, 'years');
					return day.format('YYYY-MM-DD');
				} else {
					day.add(1, 'weeks');
					return day.format('YYYY-MM-DD');
				}
			}
		}
		return false;
	}

	async setup() {
		let upcoming = await this.loadAssignments('Upcoming');
		app.log.info(`Loaded ${upcoming.length} upcoming assignments`);
		let archived = await this.loadAssignments('Archive');
		app.log.info(`Loaded ${archived.length} archived assignments`);
		this.markTaskDates();
		app.log.info('Setting up assignment check interval');
		setInterval(async () => {
			await this.checkAssignments();
		}, 60 * 1000);
		return this;
	}

	async loadAssignments(sheetTitle: string) {
		let loaded = [];
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			let update = {
				date: row.date,
				time: row.time,
				task: row.task,
				person: row.person,
				status: row.status,
			};
			let assignment = this.addAssignment(sheetTitle, update);
			loaded.push(assignment);
		}
		return loaded;
	}

	addAssignment(sheet: string, data: AssignmentUpdate) {
		let assignment = new Assignment(sheet, data);
		this.assignments.push(assignment);
		return assignment;
	}

	getAssignment(date: string, task: string) {
		for (let assignment of this.assignments) {
			if (assignment.date == date && assignment.task == task) {
				return assignment;
			}
		}
		return null;
	}

	async scheduleTasks() {
		let sheets = await Sheets.getInstance();
		await sheets.loadPeople();
		await sheets.loadTasks();
		await this.setupQueue();
		await this.markTaskDates();
		let curr = await this.archiveAssignments();
		await this.scheduleForWeek(curr);
		await this.addUpcoming();
		await this.setAssigned();
	}

	async setupQueue() {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		this.queue = people.map(p => p.name);
		this.queue.sort(() => Math.random() - 0.5);
		this.index = 0;
	}

	async markTaskDates() {
		let sheets = await Sheets.getInstance();
		let fmt = 'YYYY-MM-DD';
		for (let assignment of this.assignments) {
			let date = moment.default(assignment.date, 'M/D');
			let [task] = sheets.tasks.filter(t => t.name == assignment.task);
			if (task && (!task.lastRun || task.lastRun < date.format(fmt))) {
				task.lastRun = date.format(fmt);
				task.lastPerson = assignment.person;
				task.nextRun = date.add(task.frequency, 'days').format(fmt);
			}
		}
		let today = moment.default().format(fmt);
		for (let task of sheets.tasks) {
			if (!task.lastRun) {
				task.lastRun = moment.default().format(fmt);
				task.nextRun = moment
					.default()
					.add(task.frequency, 'days')
					.format(fmt);
			}
			let nextRun = moment.default(task.nextRun, fmt);
			while (nextRun.format(fmt) < today) {
				nextRun.add(task.frequency, 'days');
			}
			task.nextRun = nextRun.format(fmt);
		}
	}

	async scheduleForWeek(curr: moment.Moment) {
		let assignments: Assignment[] = [];
		for (let i = 0; i < 7; i++) {
			let date = curr.add(1, 'days');
			await this.scheduleForDate(date);
		}
	}

	async scheduleForDate(date: moment.Moment) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		let iso8601 = 'YYYY-MM-DD';
		let locale = 'M/D';
		for (let task of sheets.tasks) {
			if (task.nextRun && task.nextRun <= date.format(iso8601)) {
				let person = await this.selectPerson(
					task,
					people,
					date.format(iso8601)
				);
				this.addAssignment('Upcoming', {
					date: date.format(locale),
					time: this.getScheduleTime(task.time, date),
					task: task.name,
					person: person.name,
					status: AssignmentStatus.SCHEDULED,
				});
			}
		}
		this.markTaskDates();
	}

	async selectPerson(
		task: Task,
		people: Person[],
		date: string,
		iterations = 0
	) {
		let name = this.queue[this.index];
		this.index = (this.index + 1) % this.queue.length;
		let [person] = people.filter(p => p.name == name);
		if (iterations == people.length) {
			let sheets = await Sheets.getInstance();
			let backup = await sheets.currentBackup();
			if (backup) {
				person = backup;
			} else {
				throw new Error('Not enough people to complete the schedule');
			}
		} else if (name == task.lastPerson) {
			person = await this.selectPerson(
				task,
				people,
				date,
				iterations + 1
			);
		} else if (person.isAway(date, task.time)) {
			person = await this.selectPerson(
				task,
				people,
				date,
				iterations + 1
			);
		}
		return person;
	}

	getScheduleTime(time: string, date: moment.Moment) {
		if (time == 'sunset') {
			let sunsetUTC = suntimes.getSunsetDateTimeUtc(
				date.toDate(),
				this.latitude,
				this.longitude
			);
			let sunsetLocal = moment.tz(sunsetUTC, 'UTC').add(10, 'minutes');
			return sunsetLocal.tz(this.timezone).format('h:mm A');
		} else {
			return time;
		}
	}

	async archiveAssignments() {
		let sheets = await Sheets.getInstance();
		let upcoming = sheets.doc.sheetsByTitle['Upcoming'];
		let archive = sheets.doc.sheetsByTitle['Archive'];
		let rows = await upcoming.getRows();
		let pending = [];
		for (let row of rows) {
			let assignment = {
				date: row.date,
				time: row.time,
				task: row.task,
				person: row.person,
				status: row.status,
			};
			await archive.addRow(assignment);
			if (
				assignment.status == AssignmentStatus.PENDING ||
				assignment.status == AssignmentStatus.SCHEDULED
			) {
				pending.push(assignment);
			}
		}
		await upcoming.clearRows();
		// await upcoming.addRows(pending);
		this.assignments = [];
		let currDate: moment.Moment = moment.default();
		for (let assignment of pending) {
			this.addAssignment('Upcoming', assignment);
			currDate = moment.default(assignment.date, 'M/D');
		}
		return currDate;
	}

	async addUpcoming() {
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle['Upcoming'];
		for (let assignment of this.assignments) {
			await sheet.addRow({
				date: assignment.date,
				time: assignment.time,
				task: assignment.task,
				person: assignment.person,
				status: assignment.status,
			});
		}
	}

	async setAssigned() {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let person of people) {
			let assigned = this.assignments.filter(
				a => a.person == person.name
			);
			person.setSchedule(assigned);
		}
		return people;
	}

	async checkAssignments() {
		app.log.info('Checking assignments');
		let sheets = await Sheets.getInstance();
		let assignmentsDue = [];
		let today = moment.default().format('YYYY-MM-DD');
		let now = moment.default().format('HH:mm:ss');
		for (let assignment of this.assignments) {
			if (assignment.status != AssignmentStatus.SCHEDULED) {
				continue;
			}
			let dateTime = moment.default(
				`${assignment.date} ${assignment.time}`,
				'M/D h:mm A'
			);
			if (
				dateTime.format('YYYY-MM-DD') == today &&
				dateTime.format('HH:mm:ss') <= now
			) {
				assignmentsDue.push(assignment);
				app.log.info(`due: ${assignment.task.toLowerCase()}`);
			}
		}
		if (assignmentsDue.length > 0) {
			await this.sendAssignments(assignmentsDue);
		}
	}

	async sendAssignments(due: Assignment[]) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		let messages = Messages.getInstance();
		let voice = Voice.getInstance();
		for (let assignment of due) {
			let [person] = people.filter(p => p.name == assignment.person);
			let [task] = sheets.tasks.filter(t => t.name == assignment.task);
			if (!person || !task) {
				continue;
			}
			person.assignment = assignment;
			person.context = PersonContext.ASSIGNMENT;
			await assignment.setPending();
			if (person.call) {
				voice.call(person);
			} else {
				messages.sendAssignment(person, assignment);
			}
		}
	}
}

export default Calendar;
