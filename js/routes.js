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
const sms_1 = __importDefault(require("./sms"));
const config_1 = __importDefault(require("./config"));
const sheets_1 = __importDefault(require("./sheets"));
function routes(app) {
    return __awaiter(this, void 0, void 0, function* () {
        app.get('/', (request, reply) => {
            return {
                chickenbot: '🐔'
            };
        });
        app.post('/sms', (request, reply) => __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance(config_1.default.google);
            let sms = sms_1.default.getInstance(config_1.default.twilio, sheets);
            try {
                let response = yield sms.handleMessage(request.body);
                if (response) {
                    return sms.messageResponse(reply, response);
                }
                else {
                    return {
                        chickenbot: '🐔'
                    };
                }
            }
            catch (err) {
                app.log.error(err);
                return sms.messageResponse(reply, err.message);
            }
        }));
        app.post('/update', (request, reply) => __awaiter(this, void 0, void 0, function* () {
            try {
                let sheets = yield sheets_1.default.getInstance(config_1.default.google);
                if (request.body.secret != config_1.default.google.webhookSecret) {
                    throw new Error('Invalid webhook secret.');
                }
                let assignment = yield sheets.updateAssignment(request.body);
                return {
                    assignment: assignment
                };
            }
            catch (err) {
                return {
                    error: err.message
                };
            }
        }));
    });
}
exports.default = routes;
//# sourceMappingURL=routes.js.map