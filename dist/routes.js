"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment_1 = __importDefault(require("moment"));
const sms_1 = __importDefault(require("./controllers/sms"));
const sheets_1 = __importDefault(require("./controllers/sheets"));
const calendar_1 = __importDefault(require("./controllers/calendar"));
async function routes(app) {
    app.get('/', async (_, reply) => {
        let calendar = await calendar_1.default.getInstance();
        let sheets = await sheets_1.default.getInstance();
        let sms = sms_1.default.getInstance();
        let backup = await sheets.currentBackup();
        let backupName = backup ? backup.name : 'Unknown';
        return reply.view('index.ejs', {
            phone: sms.displayPhone(sms.phone),
            spreadsheet_url: `https://docs.google.com/spreadsheets/d/${sheets.id}/edit`,
            assignments: calendar.assignments,
            backup: backupName,
            today: (0, moment_1.default)().format('YYYY-MM-DD')
        });
    });
    app.post('/sms', async (request, reply) => {
        let sms, person;
        let rsp = '';
        try {
            sms = sms_1.default.getInstance();
            person = await sms.validateMessage(request.body);
            app.log.info(`SMS from ${person.name}: ${request.body.Body}`);
            let response = await sms.handleMessage(person, request.body);
            if (response) {
                app.log.info(`SMS to ${person.name}: ${response}`);
                rsp = sms.messageResponse(reply, response);
            }
        }
        catch (err) {
            app.log.error(err);
            if (person && sms) {
                sms.relayErrorToBackup(request.body, person, err);
                rsp = sms.messageResponse(reply, 'Oops, sorry something went wrong.');
            }
        }
        return rsp;
    });
    app.post('/update', async (request, reply) => {
        try {
            let sheets = await sheets_1.default.getInstance();
            let assignment = await sheets.updateAssignment(request.body);
            return {
                assignment: assignment
            };
        }
        catch (err) {
            app.log.error(err);
            return {
                error: err.message
            };
        }
    });
}
exports.default = routes;
//# sourceMappingURL=routes.js.map