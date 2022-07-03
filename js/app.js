"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("./config"));
const fastify_1 = __importDefault(require("fastify"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const routes_1 = __importDefault(require("./routes"));
moment_timezone_1.default.tz.setDefault(config_1.default.timezone);
const app = (0, fastify_1.default)({
    logger: config_1.default.logger
});
app.register(formbody_1.default);
app.register(routes_1.default);
exports.default = app;
