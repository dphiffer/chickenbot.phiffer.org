const { GoogleSpreadsheet } = require('google-spreadsheet');
const moment = require('moment-timezone');
const path = require('path');

const Task = require('./models/task');
const Person = require('./models/person');
const Calendar = require('./models/calendar');

const MessagingResponse = require('twilio').twiml.MessagingResponse;

const config = require('./config/config');
moment.tz.setDefault(config.timezone);

const twilio = require('twilio')(
	config.twilio.accountSid,
	config.twilio.authToken
);

var app;
var backup;

(async () => {
	app = require('fastify')({
		logger: {
			transport: {
				target: 'pino-pretty',
				options: {
					translateTime: 'SYS:HH:MM:ss',
					ignore: 'pid,hostname,reqId,responseTime,req,res',
					messageFormat: '{msg} {req.method} {req.url}'
				}
			}
		}
	});

	app.log.info(`Loading https://docs.google.com/spreadsheets/d/${config.google.spreadsheetId}/edit`);
	app.doc = new GoogleSpreadsheet(config.google.spreadsheetId);
	await app.doc.useServiceAccountAuth(config.google.creds);
	await app.doc.loadInfo();
	app.log.info(`Setting up using ${app.doc.title}`);
	app.log.info(`Sending SMS from ${config.chickenbotPhone}`);

	app.tasks = await setupTasks(app.doc);
	app.people = await setupPeople(app.doc);
	app.calendar = await setupCalendar(app.doc);

	backup = await Person.currentBackup(app);
	app.log.info(`Current backup is ${backup.name}`);

	app.calendar.markTaskDates(app.tasks);

	app.register(require('@fastify/formbody'));
	app.register(require('@fastify/static'), {
		root: path.join(__dirname, 'public')
	});
	app.register(require('@fastify/view'), {
		engine: {
			ejs: require('ejs')
		},
		root: path.join(__dirname, 'views'),
		layout: 'layout.ejs',
		defaultContext: {
			url: config.url
		}
	});

	const handlers = {
		sendToBackup: async (person, data, twiml) => {
			app.log.info(`[backup] ${person}: ${data.Body}`);
			await twilio.messages.create({
				body: `${person}: ${data.Body}`,
				from: config.chickenbotPhone,
				to: backup.phone
			});
		},
		confirmCompletion: async (person, data, twiml) => {
			let assignment = app.people[person].assignment;
			let sms = data.Body.toLowerCase().trim();
			if (sms == 'y' || sms == 'yes' || sms == 'yep') {
				let response = Person.getAffirmation();
				app.log.info(`[${person}] ${response}`);
				twiml.message(response);
				await app.calendar.markAssignment(app, assignment, 'complete');
				app.people[person].handler = null;
				clearTimeout(app.people[person].timeout);
				app.people[person].timeout = null;
				app.people[person].assignment = null;
				if (app.calendar.allEventsComplete()) {
					await twilio.messages.create({
						body: "All of the current tasks are complete. To schedule next week’s tasks, reply with 'schedule'.",
						from: config.chickenbotPhone,
						to: backup.phone
					});
				}
			} else if (sms == 'snooze') {
				let time = await app.calendar.snoozeAssignment(app, assignment);
				let response = `Great, I’ll ask again at ${time}. You can reply Y or Yes at any time once you’re done.`;
				app.log.info(`[${person}] ${response}`);
				await twilio.messages.create({
					body: response,
					from: config.chickenbotPhone,
					to: app.people[person].phone
				});
				clearTimeout(app.people[person].timeout);
				app.people[person].timeout = null;
			} else {
				data.Body += ` (task: ${assignment.task})`;
				await handlers.sendToBackup(person, data, twiml);
			}
			return true;
		},
		setAway: async (person, data, twiml) => {
			let sms = data.Body.toLowerCase().trim();
			app.people[person].handler = null;
			if (sms == 'ongoing') {
				if (app.people[person].status == 'backup') {
					await twilio.messages.create({
						body: "Please reassign the designated backup first.",
						from: config.chickenbotPhone,
						to: app.people[person].phone
					});
				} else {
					await app.people[person].updateStatus(app, 'inactive');
					await twilio.messages.create({
						body: "No problem, feel free to send 'back' whenever you’re ready to take on chicken tasks again.",
						from: config.chickenbotPhone,
						to: app.people[person].phone
					});
				}
			} else {
				let days = sms.split(',');
				let awayDays = app.people[person].away.split(', ');
				for (let day of days) {
					isoDay = Calendar.parseDay(day);
					if (! isoDay) {
						await twilio.messages.create({
							body: `Sorry I couldn't make sense of '${day}' (away dates must be in the future). Try again by replying 'away'.`,
							from: config.chickenbotPhone,
							to: app.people[person].phone
						});
						return;
					}
					awayDays.push(isoDay);
				}
				awayDays = await app.people[person].updateAway(app, awayDays);
				await twilio.messages.create({
					body: `Got it, your current away days are: ${awayDays}`,
					from: config.chickenbotPhone,
					to: app.people[person].phone
				});
			}
		}
	};

	setInterval(async () => {
		let assignments = await app.calendar.checkAssignments(app);
		for (let name in assignments) {
			app.log.info(`[${name}] ${assignments[name]}`);
			await twilio.messages.create({
				body: assignments[name],
				from: config.chickenbotPhone,
				to: app.people[name].phone
			});
			app.people[name].handler = 'confirmCompletion';
			app.people[name].timeout = setTimeout(async () => {
				await handlers.sendToBackup(name, {
					Body: `[no response after 1 hour on '${app.people[name].assignment.task.toLowerCase()}']`
				});
			}, 60 * 60 * 1000);
		}
	}, 60 * 1000);

	app.get('/', (req, reply) => {
		reply.view('index.ejs', {
			phone: displayPhone(config.chickenbotPhone),
			spreadsheet_url: `https://docs.google.com/spreadsheets/d/${config.google.spreadsheetId}/edit`,
			events: app.calendar.events,
			backup: 'Dan',
			today: moment().format('M/D')
		});
	});

	app.post('/message', async (req, reply) => {
		const twiml = new MessagingResponse();
		let person = validatePhone(req.body.From);
		if (! person) {
			app.log.info(`[unknown sender] ${req.body.From}: ${req.body.Body}`);
			twiml.message('Sorry, I don’t know who you are.');
		} else {
			app.log.info(`${person}: ${req.body.Body}`);
			let sms = req.body.Body.toLowerCase().trim();
			if (sms == 'away') {
				twiml.message("Which days are you going to be away? [reply 'Mon, Tue' or '6/19, 6/21' or 'ongoing']")
				app.people[person].handler = 'setAway';
			} else if (sms == 'back') {
				await app.people[person].updateStatus(app, 'active');
				twiml.message("Welcome back! The chickens will be pleased to see you.");
			} else if (sms == 'schedule' && req.body.From == backup.phone) {
				twiml.message('Ok, scheduling tasks');
				app.calendar.scheduleTasks(app.tasks, app.people, app.doc).then(async assigned => {
					for (let name in assigned) {
						app.log.info(`[${name}] ${assigned[name]}`);
						await twilio.messages.create({
							body: assigned[name],
							from: config.chickenbotPhone,
							to: app.people[name].phone
						});
						app.people[name].handler = 'sendToBackup';
					}
				});
			} else if (sms.match(/^announce:/) && req.body.From == backup.phone) {
				let relay = req.body.Body.match(/^announce:\s*(.+)$/ims)[1];
				app.log.info(`[announce] ${relay}`);
				let count = 0;
				for (let name in app.people) {
					if (app.people[name].status != 'active') {
						continue;
					}
					await twilio.messages.create({
						body: relay,
						from: config.chickenbotPhone,
						to: app.people[name].phone
					});
					count++;
				}
				await twilio.messages.create({
					body: `Announcement sent to ${count} people.`,
					from: config.chickenbotPhone,
					to: backup.phone
				});
			} else if (sms.match(/^backup:\s+(\w+)$/) && req.body.From == backup.phone) {
				let matches = req.body.Body.match(/^backup:\s*(.+)$/ims);
				let newBackup = matches[1];
				for (let name in app.people) {
					if (name.toLowerCase() == newBackup.toLowerCase()) {
						await backup.updateStatus(app, 'active');
						await app.people[name].updateStatus(app, 'backup');
						await twilio.messages.create({
							body: `Thank you for being the designated backup! Handing things over to ${name}.`,
							from: config.chickenbotPhone,
							to: backup.phone
						});
						await twilio.messages.create({
							body: `Hi ${name}, you have been assigned to be the new designated backup. You may need to schedule the coming week’s tasks. More info: ${config.url}#backup`,
							from: config.chickenbotPhone,
							to: app.people[name].phone
						});
						backup = app.people[name];
						break;
					}
				}
			} else if (sms.match(/^(\w+):/) && req.body.From == backup.phone) {
				let to = sms.match(/^(\w+):/)[1];
				let matches = req.body.Body.match(/^(\w+):\s*(.+)$/ms);
				let relay = matches[2];
				let found = false;
				for (let name in app.people) {
					if (name.toLowerCase() == to) {
						found = true;
						app.log.info(`[${name}] ${relay}`);
						await twilio.messages.create({
							body: relay,
							from: config.chickenbotPhone,
							to: app.people[name].phone
						});
						app.people[name].handler = 'sendToBackup';
					}
				}
				if (! found) {
					twiml.message(`Sorry, I don’t know of a person named '${matches[1]}'.`);
				}
			} else if (app.people[person].handler) {
				handlers[app.people[person].handler](person, req.body, twiml);
			} else if (req.body.From == backup.phone) {
				let commands = [
					"• 'schedule' assigns tasks for the coming week.",
					"• 'announce: [msg]' broadcasts a message to everyone.",
					"• '[name]: [msg]' relays a message to a known person.",
					"• 'backup: [name]' reassigns the designated backup."
				];
				twiml.message(`Sorry, I don’t know that command! As the designated backup you can send:\n${commands.join('\n')}\nMore info: ${config.url}`);
			} else {
				handlers.sendToBackup(person, req.body, twiml);
			}
		}
		reply.header('Content-Type', 'text/xml')
		reply.send(twiml.toString());
	});

	app.post('/update', async (req, reply) => {
		let updated = false;
		if (req.body.secret == config.google.webhookSecret) {
			updated = app.calendar.updateEvent(req.body);
			app.log.info({
				updated: updated
			});
		} else {
			app.log.error(`invalid update webhook secret`);
		}
		return {
			'updated': updated
		};
	});

	app.listen(config.server, (err, address) => {
		if (err) {
			fastify.log.error(err)
			process.exit(1)
		}
	});
})();

async function setupTasks(doc) {
	let tasks = {};
	let sheet = doc.sheetsByTitle['Tasks'];
	let rows = await sheet.getRows();
	for (let row of rows) {
		let task = new Task(row);
		tasks[row.name] = task;
	}
	return tasks;
}

async function setupPeople(doc) {
	let people = {};
	let sheet = doc.sheetsByTitle['People'];
	let rows = await sheet.getRows();
	for (let row of rows) {
		let person = new Person(row);
		people[row.name] = person;
	}
	return people;
}

async function setupCalendar(doc) {
	let calendar = new Calendar();
	await calendar.addEvents(doc, 'Upcoming');
	await calendar.addEvents(doc, 'Archive');
	return calendar;
}

function validatePhone(phone) {
	for (let name in app.people) {
		let person = app.people[name];
		if (person.phone == phone) {
			return name;
		}
	}
	return false;
}

function displayPhone(phone) {
	let area = phone.substr(2, 3);
	let prefix = phone.substr(5, 3);
	let postfix = phone.substr(8, 4);
	return `${area}-${prefix}-${postfix}`;
}
