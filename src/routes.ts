import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage, AssignmentUpdate } from './types';
import SMS from './controllers/sms';
import config from './config';
import Sheets from './controllers/sheets';

async function routes(app: FastifyInstance) {
    app.post('/sms', async (request: FastifyRequest<{ Body: IncomingMessage }>, reply: FastifyReply) => {
        let sms, person;
        let rsp = '';
        try {
            sms = SMS.getInstance();
            person = await sms.validateMessage(request.body);
            app.log.info(`SMS from ${person.name}: ${request.body.Body}`);
            let response = await sms.handleMessage(person, request.body);
            if (response) {
                app.log.info(`SMS to ${person.name}: ${response}`);
                rsp = sms.messageResponse(reply, response);
            }
        } catch (err) {
            app.log.error(err);
            if (person && sms) {
                sms.relayErrorToBackup(request.body, person, err as Error);
                rsp = sms.messageResponse(reply, 'Oops, sorry something went wrong.');
            }
        }
        return rsp;
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
            app.log.error(err);
            return {
                error: (err as Error).message
            };
        }
    });
}

export default routes;