"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment_1 = __importDefault(require("moment"));
const messages_1 = __importDefault(require("./controllers/messages"));
const voice_1 = __importDefault(require("./controllers/voice"));
const sheets_1 = __importDefault(require("./controllers/sheets"));
const calendar_1 = __importDefault(require("./controllers/calendar"));
async function routes(app) {
    app.get('/', async (_, reply) => {
        let calendar = await calendar_1.default.getInstance();
        let sheets = await sheets_1.default.getInstance();
        let messages = messages_1.default.getInstance();
        let backup = await sheets.currentBackup();
        let backupName = backup ? backup.name : 'Unknown';
        return reply.view('index.ejs', {
            phone: messages.displayPhone(messages.phone),
            spreadsheet_url: `https://docs.google.com/spreadsheets/d/${sheets.id}/edit`,
            assignments: calendar.assignments,
            backup: backupName,
            today: (0, moment_1.default)().format('YYYY-MM-DD'),
        });
    });
    app.post('/message', async (request, reply) => {
        let messages, person;
        let rsp = '';
        try {
            messages = messages_1.default.getInstance();
            person = await messages.validateMessage(request.body);
            app.log.info(`Message from ${person.name}: ${request.body.Body}`);
            let response = await messages.handleMessage(person, request.body);
            if (response) {
                app.log.info(`Message to ${person.name}: ${response}`);
                rsp = messages.messageResponse(reply, response);
            }
        }
        catch (err) {
            app.log.error(err);
            if (person && messages) {
                messages.relayErrorToBackup(request.body, person, err);
                rsp = messages.messageResponse(reply, 'Oops, sorry something went wrong.');
                reply.status(500);
            }
        }
        return rsp;
    });
    app.post('/message/status', async (request, reply) => {
        let error = request.body.errorMessage
            ? `(${request.body.errorMessage})`
            : '';
        await messages_1.default.updatePendingMessage(request.body.MessageSid, request.body.MessageStatus);
        reply.send({
            ok: true,
        });
    });
    app.post('/call/:phone', async (request, reply) => {
        let voice = voice_1.default.getInstance();
        reply.header('Content-Type', 'text/xml');
        try {
            let rsp = await voice.handlePrompt(request.params.phone);
            return rsp;
        }
        catch (err) {
            reply.status(500);
            app.log.error(err);
            return voice.say('Sorry, something went wrong. Goodbye!');
        }
    });
    app.post('/call/:phone/response', async (request, reply) => {
        let voice = voice_1.default.getInstance();
        reply.header('Content-Type', 'text/xml');
        try {
            let rsp = await voice.handleResponse(request.params.phone, request.body.Digits);
            return rsp;
        }
        catch (err) {
            reply.status(500);
            app.log.error(err);
            return voice.say('Sorry, something went wrong. Goodbye!');
        }
    });
    app.post('/call/:phone/status', async (request, reply) => {
        try {
            let voice = voice_1.default.getInstance();
            await voice.handleStatus(request.params.phone, request.body.CallStatus);
            return {
                ok: true,
            };
        }
        catch (err) {
            app.log.error(err);
        }
    });
    app.post('/update', async (request, reply) => {
        try {
            let sheets = await sheets_1.default.getInstance();
            return sheets.updateFromWebhook(request.body);
        }
        catch (err) {
            app.log.error(err);
            return {
                error: err.message,
            };
        }
    });
}
exports.default = routes;
//# sourceMappingURL=routes.js.map