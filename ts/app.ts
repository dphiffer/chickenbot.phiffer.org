import config from './config';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import moment from 'moment-timezone';
import routes from './routes';
import Sheets from './sheets';

moment.tz.setDefault(config.timezone);
Sheets.init(config.google);

const app = Fastify({
    logger: config.logger
});

app.register(formBodyPlugin);
app.register(routes);

export default app;