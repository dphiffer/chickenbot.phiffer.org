import * as moment from 'moment-timezone';
import * as suntimes from 'suntimes';
import { CalendarConfig } from './types';
import Sheets from './sheets';
import Person from './models/person';
import Task from './models/task';
import Assignment from './models/assignment';

class Calendar {

	private static instance: Calendar;
	sheets: Sheets;
	assignments: Assignment[] = [];

	queue: string[] = [];
	index: number = 0;

	timezone: string;
	latitude: number;
	longitude: number;

	private constructor(config: CalendarConfig, sheets: Sheets) {
		this.sheets = sheets;
		this.timezone = config.timezone;
		this.latitude = config.latitude;
		this.longitude = config.longitude;
		moment.tz.setDefault(config.timezone);
	}

	static async getInstance(config: CalendarConfig, sheets: Sheets) {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Calendar(config, sheets);
		await this.instance.setup();
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
		await this.addAssignments('Upcoming');
		await this.addAssignments('Archive');
		this.markTaskDates();
		return this;
	}

	async addAssignments(sheetTitle: string) {
		let sheet = this.sheets.doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.addAssignment(sheetTitle, row);
		}
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
		await this.sheets.loadPeople();
		await this.sheets.loadTasks();
		this.setupQueue();
		this.markTaskDates();
		await this.archiveCompleted();
		let assignments = this.scheduleForWeek();
		await this.addUpcoming(assignments);
		return this.setAssigned(assignments);
	}

	setupQueue() {
		let people = this.sheets.getActivePeople();
		this.queue = people.map(p => p.name);
		this.queue.sort(() => Math.random() - 0.5);
		this.index = 0;
	}

	markTaskDates() {
		let tasks = this.sheets.tasks;
		let fmt = 'YYYY-MM-DD';
		for (let assignment of this.assignments) {
			let date = moment.default(assignment.date, 'M/D');
			let [ task ] = tasks.filter(t => t.name == assignment.task);
			if (task && (!task.lastRun || task.lastRun < date.format(fmt))) {
				task.lastRun = date.format(fmt);
				task.lastPerson = assignment.person;
				task.nextRun = date.add(task.frequency, 'days').format(fmt);
			}
		}
		let today = moment.default().format(fmt);
		for (let task of tasks) {
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

	scheduleForWeek() {
		let now = moment.default();
		let assignments: Assignment[] = [];
		for (let i = 0; i < 7; i++) {
			let date = now.add(1, 'days');
			let scheduled = this.scheduleForDate(date);
			assignments = [...assignments, ...scheduled];
		}
		return assignments;
	}

	scheduleForDate(date: moment.Moment) {
		let people = this.sheets.getActivePeople();
		let iso8601 = 'YYYY-MM-DD';
		let locale = 'M/D';
		let assignments: Assignment[] = [];
		for (let task of this.sheets.tasks) {
			if (task.nextRun && task.nextRun <= date.format(iso8601)) {
				let person = this.selectPerson(task, people, date.format(iso8601));
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

	selectPerson(task: Task, people: Person[], date: string): Person {
		let name = this.queue[this.index];
		this.index++;
		if (this.index == this.queue.length) {
			this.index = 0;
		}
		let [ person ] = people.filter(p => p.name == name);
		if (name == task.lastPerson) {
			return this.selectPerson(task, people, date);
		} else if (person.isAway(date)) {
			return this.selectPerson(task, people, date);
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
		let upcoming = this.sheets.doc.sheetsByTitle['Upcoming'];
		let archive = this.sheets.doc.sheetsByTitle['Archive'];
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
		let sheet = this.sheets.doc.sheetsByTitle['Upcoming'];
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

	setAssigned(assignments: Assignment[]) {
		let people = this.sheets.getActivePeople();
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
				let [ person ]  = this.sheets.people.filter(p => p.name == assignment.person);
				let [ task ] = this.sheets.tasks.filter(t => t.name == assignment.task);
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
