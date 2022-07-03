import config from './config';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import moment from 'moment-timezone';
import routes from './routes';

moment.tz.setDefault(config.timezone);

const app = Fastify({
    logger: config.logger
});

app.register(formBodyPlugin);
app.register(routes);

export default app;