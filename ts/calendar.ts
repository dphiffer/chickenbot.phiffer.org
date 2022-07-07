import * as moment from 'moment-timezone';
import * as suntimes from 'suntimes';
import Sheets from './sheets';
import Person from './models/person';
import Task from './models/task';
import Event from './models/event';
import config from './config';

class Calendar {

	private static instance: Calendar;
	sheets: Sheets;
	events: Event[] = [];

	queue: string[] = [];
	index: number = 0;

	private constructor(sheets: Sheets) {
		this.sheets = sheets;
	}

	static async getInstance(sheets: Sheets) {
		if (this.instance) {
			return this.instance;
		}
		this.instance = new Calendar(sheets);
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
		await this.addEvents('Upcoming');
		await this.addEvents('Archive');
		this.markTaskDates();
		return this;
	}

	async addEvents(sheetTitle: string) {
		let sheet = this.sheets.doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.addEvent(sheetTitle, row);
		}
	}

	addEvent(sheet: string, row: any) {
		let event = new Event(sheet, row);
		this.events.push(event);
		return event;
	}

	getEvent(date: string, task: string) {
		for (let event of this.events) {
			if (event.date == date && event.task == task) {
				return event;
			}
		}
	}

	async scheduleTasks() {
		await this.sheets.loadPeople();
		await this.sheets.loadTasks();
		this.setupQueue();
		this.markTaskDates();
		await this.archiveCompletedEvents();
		let events = this.scheduleEventsForWeek();
		await this.addUpcomingEvents(events);
		return this.setAssignedEvents(events);
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
		for (let event of this.events) {
			let eventDate = moment.default(event.date, 'M/D');
			let [ task ] = tasks.filter(t => t.name == event.task);
			if (task && (!task.lastRun || task.lastRun < eventDate.format(fmt))) {
				task.lastRun = eventDate.format(fmt);
				task.lastPerson = event.person;
				task.nextRun = eventDate.add(task.frequency, 'days').format(fmt);
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

	scheduleEventsForWeek() {
		let now = moment.default();
		let events: Event[] = [];
		for (let i = 0; i < 7; i++) {
			let date = now.add(1, 'days');
			let scheduled = this.scheduleEventsOnDate(date);
			events = [...events, ...scheduled];
		}
		return events;
	}

	scheduleEventsOnDate(date: moment.Moment) {
		let people = this.sheets.getActivePeople();
		let iso8601 = 'YYYY-MM-DD';
		let locale = 'M/D';
		let events: Event[] = [];
		for (let task of this.sheets.tasks) {
			if (task.nextRun && task.nextRun <= date.format(iso8601)) {
				let person = this.selectPerson(task, people, date.format(iso8601));
				let event = this.addEvent('Upcoming', new Event('Upcoming', {
					date: date.format(locale),
					time: this.getEventTime(task.time, date),
					task: task.name,
					person: person.name,
					status: 'scheduled'
				}));
				events.push(event);
			}
		}
		this.markTaskDates();
		return events;
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

	getEventTime(time: string, date: moment.Moment) {
		if (time == 'sunset') {
			let sunsetUTC = suntimes.getSunsetDateTimeUtc(
				date.toDate(),
				config.latitude,
				config.longitude
			);
			let sunsetLocal = moment.tz(sunsetUTC, 'UTC').add(10, 'minutes');
			return sunsetLocal.tz(config.timezone).format('h:mm A');
		} else {
			return time;
		}
	}

	async archiveCompletedEvents() {
		let upcoming = this.sheets.doc.sheetsByTitle['Upcoming'];
		let archive = this.sheets.doc.sheetsByTitle['Archive'];
		let today = moment.default().format('M/D');
		let rows = await upcoming.getRows();
		let pending = [];
		for (let row of rows) {
			let event = {
				date: row.date,
				time: row.time,
				task: row.task,
				person: row.person,
				status: row.status
			};
			await archive.addRow(event);
			if (event.status != 'complete') {
				pending.push(event);
			}
		}
		await upcoming.clearRows();
		await upcoming.addRows(pending);
	}

	async addUpcomingEvents(events: any[]) {
		let sheet = this.sheets.doc.sheetsByTitle['Upcoming'];
		for (let event of events) {
			await sheet.addRow(event);
		}
	}

	setAssignedEvents(events: Event[]) {
		let people = this.sheets.getActivePeople();
		for (let person of people) {
			let assigned: string[] = [];
			for (let event of events) {
				if (event.person == person.name) {
					let date = moment.default(event.date, 'M/D').format('ddd M/D');
					assigned.push(`${date}: ${event.task}`);
				}
			}
			person.assigned = `Hi ${person.name}, here are your scheduled chicken tasks for this week:\n${assigned.join('\n')}`;
		}
		return people;
	}

	// async checkAssignments(app) {
	// 	let assignments = {};
	// 	let eventFormat = 'M/D h:mm A';
	// 	let today = moment().format('YYYY-MM-DD');
	// 	let now = moment().format('HH:mm:ss');
	// 	for (let event of this.events) {
	// 		if (event.status != 'scheduled') {
	// 			continue;
	// 		}
	// 		let eventTime = moment(`${event.date} ${event.time}`, eventFormat);
	// 		if (eventTime.format('YYYY-MM-DD') == today &&
	// 			eventTime.format('HH:mm:ss') <= now) {
	// 			let person = app.people[event.person];
	// 			let task = app.tasks[event.task];
	// 			if (! person || ! task) {
	// 				continue;
	// 			}
	// 			person.assignment = event;
	// 			assignments[event.person] = `Hi ${event.person}, ${task.question} [reply Y or Yes or Snooze for more time]`;
	// 			await this.markAssignment(app, event, 'pending');
	// 		}
	// 	}
	// 	return assignments;
	// }

	// async markAssignment(app, assignment, status) {
	// 	let assignmentId = `${assignment.date} ${assignment.task}`;
	// 	let sheet = app.doc.sheetsByTitle['Upcoming'];
	// 	let rows = await sheet.getRows();
	// 	let index = 0;
	// 	for (let event of this.events) {
	// 		if (assignmentId == `${event.date} ${event.task}`) {
	// 			this.events[index].status = status;
	// 			break;
	// 		}
	// 		index++;
	// 	}
	// 	for (let row of rows) {
	// 		if (assignmentId == `${row.date} ${row.task}`) {
	// 			row.status = status;
	// 			await row.save();
	// 		}
	// 	}
	// }

	// async snoozeAssignment(app, assignment) {
	// 	let assignmentId = `${assignment.date} ${assignment.task}`;
	// 	let sheet = app.doc.sheetsByTitle['Upcoming'];
	// 	let rows = await sheet.getRows();
	// 	let index = 0;
	// 	let rescheduled;
	// 	for (let event of this.events) {
	// 		if (assignmentId == `${event.date} ${event.task}`) {
	// 			rescheduled = moment().add('1', 'hours').format('h:mm A');
	// 			this.events[index].time = rescheduled;
	// 			this.events[index].status = 'scheduled';
	// 			break;
	// 		}
	// 		index++;
	// 	}
	// 	for (let row of rows) {
	// 		if (assignmentId == `${row.date} ${row.task}`) {
	// 			row.time = rescheduled;
	// 			row.status = 'scheduled';
	// 			await row.save();
	// 			break;
	// 		}
	// 	}
	// 	return rescheduled;
	// }

	// allEventsComplete() {
	// 	for (let event of this.events) {
	// 		if (event.sheet != 'Upcoming') {
	// 			continue;
	// 		}
	// 		if (event.status != 'complete') {
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// }
}

export default Calendar;
