import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage, EventUpdate } from './types';
import SMS from './sms';
import config from './config';
import Sheets from './sheets';

async function routes(app: FastifyInstance) {
    app.get('/', (request, reply) => {
        return {
            chickenbot: '🐔'
        };
    });
    
    app.post('/sms', async (request: FastifyRequest<{ Body: IncomingMessage }>, reply: FastifyReply) => {
        let sheets = await Sheets.getInstance(config.google);
        let sms = SMS.getInstance(config.twilio, sheets);
        try {
            let response = await sms.handleMessage(request.body);
            if (response) {
                return sms.messageResponse(reply, response);
            } else {
                return {
                    chickenbot: '🐔'
                };
            }
        } catch (err) {
            app.log.error(err);
            return sms.messageResponse(reply, (err as Error).message);
        }
    });

    app.post('/update', async (request: FastifyRequest<{ Body: EventUpdate }>, reply: FastifyReply) => {
        try {
            let sheets = await Sheets.getInstance(config.google);
            let event = await sheets.updateEvent(request.body);
            return {
                event: event
            };
        } catch (err) {
            return {
                error: (err as Error).message
            };
        }
    });
}

export default routes;