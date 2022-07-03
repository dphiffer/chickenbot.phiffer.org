import config from './config';
import { FastifyReply } from 'fastify';
import { IncomingMessage } from './types';
import { twiml } from 'twilio';

function handleMessage(sms: IncomingMessage) {
    validateMessage(sms);
    return sms.Body;
}

function validateMessage(sms: IncomingMessage): void {
    if (sms.AccountSid !== config.twilio.accountSid) {
        throw new Error('Whoops, Twilio needs to be configured.');
    }
}

function messageResponse(reply: FastifyReply, response: string) {
    let rsp = new twiml.MessagingResponse();
    rsp.message(response);
    reply.header('Content-Type', 'text/xml');
    return rsp.toString();
}

export {
    handleMessage,
    messageResponse
};