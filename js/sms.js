"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageResponse = exports.handleMessage = void 0;
const config_1 = __importDefault(require("./config"));
const twilio_1 = require("twilio");
function handleMessage(sms) {
    validateMessage(sms);
    return sms.Body;
}
exports.handleMessage = handleMessage;
function validateMessage(sms) {
    if (sms.AccountSid !== config_1.default.twilio.accountSid) {
        throw new Error('Whoops, Twilio needs to be configured.');
    }
}
function messageResponse(reply, response) {
    let rsp = new twilio_1.twiml.MessagingResponse();
    rsp.message(response);
    reply.header('Content-Type', 'text/xml');
    return rsp.toString();
}
exports.messageResponse = messageResponse;
