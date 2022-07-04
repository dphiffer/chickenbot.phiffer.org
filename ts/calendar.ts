import * as moment from 'moment-timezone';
import suntimes from 'suntimes';
import Sheets from './sheets';
import Event from './models/event';
import { GoogleSpreadsheetRow } from 'google-spreadsheet';

class Calendar {

	private static instance: Calendar;
	sheets: Sheets;
	events: Event[] = [];

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
		return this;
	}

	async addEvents(sheetTitle: string) {
		let sheet = this.sheets.doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.addEvent(sheetTitle, row);
		}
	}

	addEvent(sheet: string, row: GoogleSpreadsheetRow) {
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

	// updateEvent(data) {
	// 	let dateTask = `${data.date} ${data.task}`;
	// 	let index = 0;
	// 	for (let event of this.events) {
	// 		let eventDateTask = `${event.date} ${event.task}`;
	// 		if (dateTask == eventDateTask) {
	// 			this.events[index].time = data.time;
	// 			this.events[index].person = data.person;
	// 			this.events[index].status = data.status;
	// 			return this.events[index];
	// 		}
	// 		index++;
	// 	}
	// 	return false;
	// }

	// markTaskDates(tasks: Event[]) {
	// 	let fmt = 'YYYY-MM-DD';
	// 	for (let event of this.events) {
	// 		let eventDate = moment.default(event.date, 'M/D');
	// 		if (tasks[event.task] &&
	// 		    (! tasks[event.task].lastRun ||
	// 		     tasks[event.task].lastRun < eventDate.format(fmt))) {
	// 			let task = tasks[event.task];
	// 			task.lastRun = eventDate.format(fmt);
	// 			task.lastPerson = event.person;
	// 			task.nextRun = eventDate.add(task.frequency, 'days').format(fmt);
	// 		}
	// 	}
	// 	for (let name in tasks) {
	// 		let task = tasks[name];
	// 		if (! task.lastRun) {
	// 			task.lastRun = moment.default().format(fmt);
	// 			task.nextRun = moment.default().add(task.frequency, 'days').format(fmt);
	// 		}
	// 	}
	// }

	// async scheduleTasks(tasks, people, doc) {
	// 	let now = moment();
	// 	let activePeople = this.getActivePeople(people);
	// 	let events = [];
	// 	for (let i = 0; i < 7; i++) {
	// 		let date = now.add(1, 'days');
	// 		let scheduled = this.scheduleEvents(tasks, activePeople, date);
	// 		events = [...events, ...scheduled];
	// 	}
	// 	await this.archiveEvents(doc);
	// 	await this.upcomingEvents(events, doc);
	// 	return this.getAssignedEvents(events, activePeople);
	// }

	// getActivePeople(people) {
	// 	let active = {};
	// 	for (let name in people) {
	// 		if (people[name].status == 'active' ||
	// 		    people[name].status == 'backup') {
	// 			active[name] = people[name];
	// 		}
	// 	}
	// 	return active;
	// }

	// scheduleEvents(tasks, people, date) {
	// 	let iso8601 = 'YYYY-MM-DD';
	// 	let locale = 'M/D';
	// 	let events = [];
	// 	for (let name in tasks) {
	// 		let task = tasks[name];
	// 		if (task.nextRun <= date.format(iso8601)) {
	// 			let person = this.selectPerson(task, people, date.format(iso8601));
	// 			let event = this.addEvent('Upcoming', {
	// 				date: date.format(locale),
	// 				time: this.getEventTime(task.time, date),
	// 				task: task.name,
	// 				person: person.name,
	// 				status: 'scheduled'
	// 			});
	// 			events.push(event);
	// 		}
	// 	}
	// 	this.markTaskDates(tasks);
	// 	return events;
	// }

	// getEventTime(time, date) {
	// 	const config = require('../config/config');
	// 	if (time == 'sunset') {
	// 		let sunsetUTC = suntimes.getSunsetDateTimeUtc(
	// 			date.toDate(),
	// 			config.latitude,
	// 			config.longitude
	// 		);
	// 		let sunsetLocal = moment.tz(sunsetUTC, 'UTC').add(10, 'minutes');
	// 		return sunsetLocal.tz(config.timezone).format('h:mm A');
	// 	} else {
	// 		return time;
	// 	}
	// }

	// selectPerson(task, people, date) {
	// 	if (! this.names) {
	// 		this.names = [];
	// 		for (let name in people) {
	// 			this.names.push(name);
	// 		}
	// 		this.names.sort(() => Math.random() - 0.5);
	// 		this.nameIndex = 0;
	// 	}
	// 	this.nameIndex++;
	// 	if (this.nameIndex >= this.names.length) {
	// 		this.nameIndex = 0;
	// 	}
	// 	let name = this.names[this.nameIndex];
	// 	if (name == task.lastPerson) {
	// 		return this.selectPerson(task, people, date);
	// 	} else if (people[name].isAway(date)) {
	// 		return this.selectPerson(task, people, date);
	// 	}
	// 	return people[name];
	// }

	// async archiveEvents(doc) {
	// 	let upcoming = doc.sheetsByTitle['Upcoming'];
	// 	let archive = doc.sheetsByTitle['Archive'];
	// 	let today = moment().format('M/D');
	// 	let rows = await upcoming.getRows();
	// 	let pending = [];
	// 	for (let row of rows) {
	// 		let event = {
	// 			date: row.date,
	// 			time: row.time,
	// 			task: row.task,
	// 			person: row.person,
	// 			status: row.status
	// 		};
	// 		await archive.addRow(event);
	// 		if (event.status != 'complete') {
	// 			pending.push(event);
	// 		}
	// 	}
	// 	await upcoming.clearRows();
	// 	await upcoming.addRows(pending);
	// }

	// async upcomingEvents(events, doc) {
	// 	let sheet = doc.sheetsByTitle['Upcoming'];
	// 	for (let event of events) {
	// 		await sheet.addRow(event);
	// 	}
	// }

	// getAssignedEvents(events, activePeople) {
	// 	let assigned = {};
	// 	for (let name in activePeople) {
	// 		assigned[name] = [];
	// 		for (let event of events) {
	// 			if (event.person == name) {
	// 				let date = moment(event.date, 'M/D').format('ddd M/D');
	// 				assigned[name].push(`${date}: ${event.task}`);
	// 			}
	// 		}
	// 		assigned[name] = `Hi ${name}, here are your scheduled chicken tasks for this week:\n${assigned[name].join('\n')}`;
	// 	}
	// 	return assigned;
	// }

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
