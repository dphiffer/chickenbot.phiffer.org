const { GoogleSpreadsheet } = require('google-spreadsheet');
const moment = require('moment-timezone');
const Task = require('./task');
const Person = require('./person');
const Calendar = require('./calendar');
const MessagingResponse = require('twilio').twiml.MessagingResponse;

const config = require('./config/config');
moment.tz.setDefault(config.timezone);
const twilio = require('twilio')(
	config.twilio.accountSid,
	config.twilio.authToken
);
var app;

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

	app.tasks = await setupTasks(app.doc);
	app.people = await setupPeople(app.doc);
	app.calendar = await setupCalendar(app.doc);

	app.calendar.markTaskDates(app.tasks);

	app.register(require('@fastify/formbody'));

	const handlers = {
		sendToAdmin: async (person, data, twiml) => {
			app.log.info(`[Admin] ${person}: ${data.Body}`);
			await twilio.messages.create({
				body: `${person}: ${data.Body}`,
				from: config.chickenbotPhone,
				to: config.adminPhone
			});
		},
		confirmCompletion: async (person, data, twiml) => {
			let assignment = app.people[person].assignment;
			let sms = data.Body.toLowerCase().trim();
			if (sms == 'y' || sms == 'yes' || sms == 'yep') {
				let response = Person.getAffirmation();
				app.log.info(`Chickenbot: ${response}`);
				twiml.message(response);
				await app.calendar.markAssignment(app, assignment, 'complete');
				app.people[person].handler = 'sendToAdmin';
				clearTimeout(app.people[person].timeout);
				app.people[person].timeout = null;
				app.people[person].assignment = null;
			} else {
				data.Body += ` (task: ${assignment.task})`;
				await handlers.sendToAdmin(person, data, twiml);
			}
		}
	};

	setTimeout(async () => {
		let assignments = await app.calendar.checkAssignments(app);
		for (let name in assignments) {
			app.log.info(`Chickenbot: ${assignments[name]}`);
			await twilio.messages.create({
				body: assignments[name],
				from: config.chickenbotPhone,
				to: app.people[name].phone
			});
			app.people[name].handler = 'confirmCompletion';
			app.people[name].timeout = setTimeout(async () => {
				await handlers.sendToAdmin(name, {
					Body: `[no response after 1 hour on '${app.people[name].assignment.task.toLowerCase()}']`
				});
			}, 60 * 1000);
		}
	}, 60 * 1000);

	app.get('/', (req, reply) => {
		reply.send({ chickenbot: 'Try POST instead.'});
	});

	app.post('/', async (req, reply) => {
		const twiml = new MessagingResponse();
		let person = validatePhone(req.body.From);
		if (! person) {
			app.log.info(`unknown sender: ${req.body.From}`);
			twiml.message('Sorry, I don’t know who you are.');
		} else {
			app.log.info(`${person}: ${req.body.Body}`);
			let sms = req.body.Body.toLowerCase().trim();
			if (sms == 'schedule' && req.body.From == config.adminPhone) {
				twiml.message('Ok, scheduling tasks');
				app.calendar.scheduleTasks(app.tasks, app.people, app.doc).then(async assigned => {
					for (let name in assigned) {
						app.log.info(`Chickenbot: ${assigned[name]}`);
						await twilio.messages.create({
							body: assigned[name],
							from: config.chickenbotPhone,
							to: app.people[name].phone
						});
						app.people[name].handler = 'sendToAdmin';
					}
				});
			} else if (sms.match(/^announce:/) && req.body.From == config.adminPhone) {
				let relay = req.body.Body.match(/^announce:\s*(.+)$/ims)[1];
				app.log.info(`Announcement: ${relay}`);
				for (let name in app.people) {
					await twilio.messages.create({
						body: relay,
						from: config.chickenbotPhone,
						to: app.people[name].phone
					});
				}
			} else if (sms.match(/^(\w+):/) && req.body.From == config.adminPhone) {
				let to = sms.match(/^(\w+):/)[1];
				let relay = req.body.Body.match(/^\w+:\s*(.+)$/ms)[1];
				for (let name in app.people) {
					if (name.toLowerCase() == to) {
						app.log.info(`Chickenbot: ${relay}`);
						await twilio.messages.create({
							body: relay,
							from: config.chickenbotPhone,
							to: app.people[name].phone
						});
						app.people[name].handler = 'sendToAdmin';
					}
				}
			} else if (app.people[person].handler) {
				handlers[app.people[person].handler](person, req.body, twiml);
			} else {
				handlers.sendToAdmin(person, req.body, twiml);
			}
		}
		reply.header('Content-Type', 'text/xml')
		reply.send(twiml.toString());
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
