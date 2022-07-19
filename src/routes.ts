import moment from 'moment';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AssignmentUpdate } from './models/assignment';
import { PersonUpdate } from './models/person';
import Messages from './controllers/messages';
import Voice from './controllers/voice';
import Sheets from './controllers/sheets';
import Calendar from './controllers/calendar';

export interface WebhookUpdate {
	secret: string;
	assignment?: AssignmentUpdate;
	person?: PersonUpdate;
}

export interface IncomingMessage {
	ApiVersion: '2010-04-01';
	AccountSid: string;
	Body: string;
	NumMedia: string;
	From: string;
	[property: string]: string;
}

async function routes(app: FastifyInstance) {
	app.get('/', async (_, reply: FastifyReply) => {
		let calendar = await Calendar.getInstance();
		let sheets = await Sheets.getInstance();
		let messages = Messages.getInstance();
		let backup = await sheets.currentBackup();
		let backupName = backup ? backup.name : 'Unknown';
		return reply.view('index.ejs', {
			phone: messages.displayPhone(messages.phone),
			spreadsheet_url: `https://docs.google.com/spreadsheets/d/${sheets.id}/edit`,
			assignments: calendar.assignments,
			backup: backupName,
			today: moment().format('YYYY-MM-DD'),
		});
	});

	app.post(
		'/message',
		async (
			request: FastifyRequest<{ Body: IncomingMessage }>,
			reply: FastifyReply
		) => {
			let messages, person;
			let rsp = '';
			try {
				messages = Messages.getInstance();
				person = await messages.validateMessage(request.body);
				app.log.info(
					`Message from ${person.name}: ${request.body.Body}`
				);
				let response = await messages.handleMessage(
					person,
					request.body
				);
				if (response) {
					app.log.info(`Message to ${person.name}: ${response}`);
					rsp = messages.messageResponse(reply, response);
				}
			} catch (err) {
				app.log.error(err);
				if (person && messages) {
					messages.relayErrorToBackup(
						request.body,
						person,
						err as Error
					);
					rsp = messages.messageResponse(
						reply,
						'Oops, sorry something went wrong.'
					);
					reply.status(500);
				}
			}
			return rsp;
		}
	);

	app.get(
		'/call/:sid',
		async (
			request: FastifyRequest<{ Params: { sid: string } }>,
			reply: FastifyReply
		) => {
			let voice = Voice.getInstance();
			reply.header('Content-Type', 'text/xml');
			try {
				let rsp = await voice.getResponse(request.params.sid);
				return rsp;
			} catch (err) {
				reply.status(500);
				app.log.error(err);
				return voice.say('Sorry, something went wrong. Goodbye!');
			}
		}
	);

	app.post(
		'/call/:sid',
		async (
			request: FastifyRequest<{
				Params: { sid: string };
				Body: { digits: string };
			}>,
			reply: FastifyReply
		) => {
			let voice = Voice.getInstance();
			reply.header('Content-Type', 'text/xml');
			try {
				let rsp = await voice.postResponse(
					request.params.sid,
					request.body.digits
				);
				return rsp;
			} catch (err) {
				reply.status(500);
				app.log.error(err);
				return voice.say('Sorry, something went wrong. Goodbye!');
			}
		}
	);

	app.post(
		'/update',
		async (
			request: FastifyRequest<{
				Body: {
					secret: string;
					assignment?: AssignmentUpdate;
					person?: PersonUpdate;
				};
			}>,
			reply: FastifyReply
		) => {
			try {
				let sheets = await Sheets.getInstance();
				return sheets.updateFromWebhook(request.body);
			} catch (err) {
				app.log.error(err);
				return {
					error: (err as Error).message,
				};
			}
		}
	);
}

export default routes;
