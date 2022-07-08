import * as moment from 'moment-timezone';
import * as suntimes from 'suntimes';
import { CalendarConfig } from '../types';
import app from '../app';
import Sheets from './sheets';
import Person from '../models/person';
import Task from '../models/task';
import Assignment from '../models/assignment';

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
			if (moment.default(input, format).isValid()) {
				let day = moment.default(input, format);
				if (day.format('YYYY-MM-DD') > today) {
					return day.format('YYYY-MM-DD');
				}
				if (day.format('YYYY-MM-DD') == today || format == 'YYYY-MM-DD') {
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
		app.log.info(`loaded ${upcoming.length} upcoming assignments`);
		let archived = await this.loadAssignments('Archive');
		app.log.info(`loaded ${archived.length} archived assignments`);
		this.markTaskDates();
		return this;
	}

	async loadAssignments(sheetTitle: string) {
		let loaded = [];
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			let assignment = this.addAssignment(sheetTitle, row);
			loaded.push(assignment);
		}
		return loaded;
	}

	addAssignment(sheet: string, row: any) {
		let assignment = new Assignment(sheet, row);
		this.assignments.push(assignment);
		return assignment;
	}

	getAssignment(date: string, task: string) {
		for (let assignment of this.assignments) {
			if (assignment.date == date && assignment.task == task) {
				return assignment;
			}
		}
	}

	async scheduleTasks() {
		let sheets = await Sheets.getInstance();
		await sheets.loadPeople();
		await sheets.loadTasks();
		await this.setupQueue();
		await this.markTaskDates();
		await this.archiveCompleted();
		let assignments = await this.scheduleForWeek();
		await this.addUpcoming(assignments);
		await this.setAssigned(assignments);
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
			let [ task ] = sheets.tasks.filter(t => t.name == assignment.task);
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
				task.nextRun = moment.default().add(task.frequency, 'days').format(fmt);
			}
			let nextRun = moment.default(task.nextRun, fmt);
			while (nextRun.format(fmt) < today) {
				nextRun.add(task.frequency, 'days');
			}
			task.nextRun = nextRun.format(fmt);
		}
	}

	async scheduleForWeek() {
		let now = moment.default();
		let assignments: Assignment[] = [];
		for (let i = 0; i < 7; i++) {
			let date = now.add(1, 'days');
			let scheduled = await this.scheduleForDate(date);
			assignments = [...assignments, ...scheduled];
		}
		return assignments;
	}

	async scheduleForDate(date: moment.Moment) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		let iso8601 = 'YYYY-MM-DD';
		let locale = 'M/D';
		let assignments: Assignment[] = [];
		for (let task of sheets.tasks) {
			if (task.nextRun && task.nextRun <= date.format(iso8601)) {
				let person = await this.selectPerson(task, people, date.format(iso8601));
				let assignment = this.addAssignment('Upcoming', new Assignment('Upcoming', {
					date: date.format(locale),
					time: this.getScheduleTime(task.time, date),
					task: task.name,
					person: person.name,
					status: 'scheduled'
				}));
				assignments.push(assignment);
			}
		}
		this.markTaskDates();
		return assignments;
	}

	async selectPerson(task: Task, people: Person[], date: string, iterations = 0) {
		let name = this.queue[this.index];
		this.index = (this.index + 1) % this.queue.length;
		let [ person ] = people.filter(p => p.name == name);
		if (iterations == people.length) {
			let sheets = await Sheets.getInstance();
			let backup = await sheets.currentBackup();
			if (backup) {
				person = backup;
			} else {
				throw new Error('Not enough people to complete the schedule');
			}
		} else if (name == task.lastPerson) {
			person = await this.selectPerson(task, people, date, iterations + 1);
		} else if (person.isAway(date)) {
			person = await this.selectPerson(task, people, date, iterations + 1);
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

	async archiveCompleted() {
		let sheets = await Sheets.getInstance();
		let upcoming = sheets.doc.sheetsByTitle['Upcoming'];
		let archive = sheets.doc.sheetsByTitle['Archive'];
		let today = moment.default().format('M/D');
		let rows = await upcoming.getRows();
		let pending = [];
		for (let row of rows) {
			let assignment = {
				date: row.date,
				time: row.time,
				task: row.task,
				person: row.person,
				status: row.status
			};
			await archive.addRow(assignment);
			if (assignment.status != 'complete') {
				pending.push(assignment);
			}
		}
		await upcoming.clearRows();
		await upcoming.addRows(pending);
	}

	async addUpcoming(assignments: Assignment[]) {
		let sheets = await Sheets.getInstance();
		let sheet = sheets.doc.sheetsByTitle['Upcoming'];
		for (let assignment of assignments) {
			await sheet.addRow({
				date: assignment.date,
				time: assignment.time,
				task: assignment.task,
				person: assignment.person,
				status: assignment.status
			});
		}
	}

	async setAssigned(assignments: Assignment[]) {
		let sheets = await Sheets.getInstance();
		let people = sheets.getActivePeople();
		for (let person of people) {
			let assigned: string[] = [];
			for (let assignment of assignments) {
				if (assignment.person == person.name) {
					let date = moment.default(assignment.date, 'M/D').format('ddd M/D');
					assigned.push(`${date}: ${assignment.task}`);
				}
			}
			person.schedule = `Hi ${person.name}, here are your scheduled chicken tasks for this week:\n${assigned.join('\n')}`;
		}
		return people;
	}

	async checkAssignments() {
		let sheets = await Sheets.getInstance();
		let assignmentsDue = [];
		let today = moment.default().format('YYYY-MM-DD');
		let now = moment.default().format('HH:mm:ss');
		for (let assignment of this.assignments) {
			if (assignment.status != 'scheduled') {
				continue;
			}
			let dateTime = moment.default(`${assignment.date} ${assignment.time}`, 'M/D h:mm A');
			if (dateTime.format('YYYY-MM-DD') == today &&
				dateTime.format('HH:mm:ss') <= now) {
				let [ person ]  = sheets.people.filter(p => p.name == assignment.person);
				let [ task ] = sheets.tasks.filter(t => t.name == assignment.task);
				if (!person || !task) {
					continue;
				}
				person.assignment = assignment;
				assignment.status = 'pending';
				await assignment.save();
				assignmentsDue.push(assignment);
			}
		}
		return assignmentsDue;
	}
}

export default Calendar;
