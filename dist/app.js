"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("./config"));
const fastify_1 = __importDefault(require("fastify"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const routes_1 = __importDefault(require("./routes"));
const sheets_1 = __importDefault(require("./controllers/sheets"));
const calendar_1 = __importDefault(require("./controllers/calendar"));
const sms_1 = __importDefault(require("./controllers/sms"));
const app = (0, fastify_1.default)({
    logger: config_1.default.logger
});
app.register(formbody_1.default);
app.register(routes_1.default);
sheets_1.default.configure(config_1.default.google);
sms_1.default.configure(config_1.default.twilio);
calendar_1.default.configure(config_1.default.calendar);
(async () => {
    let sheets = await sheets_1.default.getInstance();
    await sheets.setup();
    let calendar = await calendar_1.default.getInstance();
    await calendar.setup();
})();
exports.default = app;
//# sourceMappingURL=app.js.map