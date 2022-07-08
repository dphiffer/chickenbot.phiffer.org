import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage, AssignmentUpdate } from './types';
import SMS from './controllers/sms';
import config from './config';
import Sheets from './controllers/sheets';

async function routes(app: FastifyInstance) {
    app.get('/', (request, reply) => {
        return {
            chickenbot: '🐔'
        };
    });
    
    app.post('/sms', async (request: FastifyRequest<{ Body: IncomingMessage }>, reply: FastifyReply) => {
        let sms = await SMS.getInstance();
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
            let person = await sms.validateMessage(request.body);
            if (person) {
                sms.relayErrorToBackup(request.body, person, err as Error);
            }
            return sms.messageResponse(reply, 'Oops, sorry something went wrong.');
        }
    });

    app.post('/update', async (request: FastifyRequest<{ Body: AssignmentUpdate & { secret: string } }>, reply: FastifyReply) => {
        try {
            let sheets = await Sheets.getInstance();
            if (request.body.secret != config.google.webhookSecret) {
                throw new Error('Invalid webhook secret.');
            }
            let assignment = await sheets.updateAssignment(request.body);
            return {
                assignment: assignment
            };
        } catch (err) {
            return {
                error: (err as Error).message
            };
        }
    });
}

export default routes;