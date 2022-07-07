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
const config_1 = __importDefault(require("./config"));
const fastify_1 = __importDefault(require("fastify"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const routes_1 = __importDefault(require("./routes"));
const sheets_1 = __importDefault(require("./sheets"));
const calendar_1 = __importDefault(require("./calendar"));
const sms_1 = __importDefault(require("./sms"));
const app = (0, fastify_1.default)({
    logger: config_1.default.logger
});
app.register(formbody_1.default);
app.register(routes_1.default);
(() => __awaiter(void 0, void 0, void 0, function* () {
    let sheets = yield sheets_1.default.getInstance(config_1.default.google);
    sms_1.default.getInstance(config_1.default.twilio, sheets);
    calendar_1.default.getInstance(config_1.default.calendar, sheets);
}))();
exports.default = app;
//# sourceMappingURL=app.js.map