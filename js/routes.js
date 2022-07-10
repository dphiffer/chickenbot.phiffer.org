"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sms_1 = __importDefault(require("./controllers/sms"));
const config_1 = __importDefault(require("./config"));
const sheets_1 = __importDefault(require("./controllers/sheets"));
function routes(app) {
    return __awaiter(this, void 0, void 0, function* () {
        app.get('/', (request, reply) => {
            return {
                chickenbot: '🐔'
            };
        });
        app.post('/sms', (request, reply) => __awaiter(this, void 0, void 0, function* () {
            let sms, person;
            let rsp = '';
            try {
                sms = sms_1.default.getInstance();
                person = yield sms.validateMessage(request.body);
                app.log.info(`SMS from ${person.name}: ${request.body.Body}`);
                let response = yield sms.handleMessage(person, request.body);
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
        }));
        app.post('/update', (request, reply) => __awaiter(this, void 0, void 0, function* () {
            try {
                let sheets = yield sheets_1.default.getInstance();
                if (request.body.secret != config_1.default.google.webhookSecret) {
                    throw new Error('Invalid webhook secret.');
                }
                let assignment = yield sheets.updateAssignment(request.body);
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
        }));
    });
}
exports.default = routes;
//# sourceMappingURL=routes.js.map