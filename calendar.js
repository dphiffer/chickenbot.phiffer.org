const moment = require('moment-timezone');

class Calendar {

	constructor() {
		this.events = [];
	}

	async addEvents(doc, sheetTitle) {
		let sheet = doc.sheetsByTitle[sheetTitle];
		let rows = await sheet.getRows();
		for (let row of rows) {
			this.addEvent(
				row.date,
				row.time,
				row.task,
				row.person,
				row.status
			);
		}
	}

	addEvent(date, time, task, person, status) {
		let event = {
			date: date,
			time: time,
			task: task,
			person: person,
			status: status
		};
		this.events.push(event);

		if (status == 'scheduled') {
			console.log(`scheduled: ${date} ${time} ${task} ${person}`);
		}

		return event;
	}

	updateEvent(data) {
		let dateTask = `${data.date} ${data.task}`;
		let index = 0;
		for (let event of this.events) {
			let eventDateTask = `${event.date} ${event.task}`;
			if (dateTask == eventDateTask) {
				this.events[index].time = data.time;
				this.events[index].person = data.person;
				this.events[index].status = data.status;
				console.log('updated event:');
				console.log(this.events[index]);
				return this.events[index];
			}
			index++;
		}
		return false;
	}

	markTaskDates(tasks) {
		let fmt = 'YYYY-MM-DD';
		for (let event of this.events) {
			let eventDate = moment(event.date, 'M/D');
			if (tasks[event.task] &&
			    (! tasks[event.task].lastRun ||
			     tasks[event.task].lastRun < eventDate.format(fmt))) {
				let task = tasks[event.task];
				task.lastRun = eventDate.format(fmt);
				task.lastPerson = event.person;
				task.nextRun = eventDate.add(task.frequency, 'days').format(fmt);
			}
		}
		for (let name in tasks) {
			let task = tasks[name];
			if (! task.lastRun) {
				task.lastRun = moment().format(fmt);
				task.nextRun = moment().add(task.frequency, 'days').format(fmt);
			}
		}
	}

	async scheduleTasks(tasks, people, doc) {
		let now = moment();
		let activePeople = this.getActivePeople(people);
		let events = [];
		for (let i = 0; i < 7; i++) {
			let date = now.add(1, 'days');
			let scheduled = this.scheduleEvents(tasks, activePeople, date);
			events = [...events, ...scheduled];
		}
		await this.archiveEvents(doc);
		await this.upcomingEvents(events, doc);
		return this.getAssignedEvents(events, activePeople);
	}

	getActivePeople(people) {
		let active = {};
		for (let name in people) {
			if (people[name].status == 'active') {
				active[name] = people[name];
			}
		}
		return active;
	}

	scheduleEvents(tasks, people, date) {
		let iso8601 = 'YYYY-MM-DD';
		let locale = 'M/D';
		let events = [];
		console.log(`scheduling ${date.format(iso8601)}`);
		for (let name in tasks) {
			let task = tasks[name];
			if (task.nextRun <= date.format(iso8601)) {
				let person = this.selectPerson(task, people);
				let event = this.addEvent(
					date.format(locale),
					task.time,
					task.name,
					person.name,
					'scheduled'
				);
				console.log(`    ${name} - ${person.name}`);
				events.push(event);
			}
		}
		this.markTaskDates(tasks);
		return events;
	}

	selectPerson(task, people) {
		if (! this.names) {
			this.names = [];
			for (let name in people) {
				this.names.push(name);
			}
			this.names.sort(() => Math.random() - 0.5);
			this.nameIndex = 0;
		}
		this.nameIndex++;
		if (this.nameIndex >= this.names.length) {
			this.nameIndex = 0;
		}
		let name = this.names[this.nameIndex];
		if (name == task.lastPerson) {
			console.log(`    skipping ${name} for ${task.name} since they did this last time`);
			return this.selectPerson(task, people);
		}
		return people[name];
	}

	async archiveEvents(doc) {
		console.log('archiving events');
		let upcoming = doc.sheetsByTitle['Upcoming'];
		let archive = doc.sheetsByTitle['Archive'];
		let today = moment().format('M/D');
		let rows = await upcoming.getRows();
		for (let row of rows) {
			if (row.date >= today) {
				continue;
			}
			console.log(`archiving ${row.date}: ${row.task}`);
			await archive.addRow({
				date: row.date,
				time: row.time,
				task: row.task,
				person: row.person,
				status: row.status
			});
			await row.delete();
		}
	}

	async upcomingEvents(events, doc) {
		let sheet = doc.sheetsByTitle['Upcoming'];
		for (let event of events) {
			await sheet.addRow(event);
		}
	}

	getAssignedEvents(events, activePeople) {
		let assigned = {};
		for (let name in activePeople) {
			assigned[name] = [];
			for (let event of events) {
				if (event.person == name) {
					let date = moment(event.date, 'M/D').format('ddd M/D');
					assigned[name].push(`${date}: ${event.task}`);
				}
			}
			assigned[name] = `Hi ${name}, here are your scheduled chicken tasks for this week:\n${assigned[name].join('\n')}`;
		}
		return assigned;
	}

	async checkAssignments(app) {
		let assignments = {};
		let eventFormat = 'M/D h:mm A';
		let today = moment().format('YYYY-MM-DD');
		let now = moment().format('HH:mm:ss');
		for (let event of this.events) {
			if (event.status != 'scheduled') {
				continue;
			}
			let eventTime = moment(`${event.date} ${event.time}`, eventFormat);
			if (eventTime.format('YYYY-MM-DD') == today &&
				eventTime.format('HH:mm:ss') <= now) {
				let person = app.people[event.person];
				let task = app.tasks[event.task];
				if (! person || ! task) {
					continue;
				}
				person.assignment = event;
				assignments[event.person] = `Hi ${event.person}, ${task.question} [reply Y or Yes]`;
				await this.markAssignment(app, event, 'pending');
			}
		}
		return assignments;
	}

	async markAssignment(app, assignment, status) {
		let assignmentId = `${assignment.date} ${assignment.task}`;
		let sheet = app.doc.sheetsByTitle['Upcoming'];
		let rows = await sheet.getRows();
		for (let row of rows) {
			if (assignmentId == `${row.date} ${row.task}`) {
				row.status = status;
				await row.save();
			}
		}
	}
}

module.exports = Calendar;
