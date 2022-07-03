import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IncomingMessage } from './types';
import { handleMessage, messageResponse } from './sms';

async function routes(app: FastifyInstance) {
    app.get('/', (request, reply) => {
        return {
            chickenbot: '🐔'
        };
    });
    
    app.post('/sms', async (request: FastifyRequest<{ Body: IncomingMessage }>, reply: FastifyReply) => {
        try {
            let response = handleMessage(request.body);
            if (response) {
                return messageResponse(reply, response);
            } else {
                return {
                    chickenbot: '🐔'
                };
            }
        } catch (err) {
            return messageResponse(reply, (err as Error).message);
        }
    });
}

export default routes;