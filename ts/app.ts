import config from './config';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import moment from 'moment-timezone';
import routes from './routes';
import Sheets from './sheets';
import Calendar from './calendar';

const app = Fastify({
    logger: config.logger
});
app.register(formBodyPlugin);
app.register(routes);

moment.tz.setDefault(config.timezone);

(async () => {
    let sheets = await Sheets.getInstance(config.google);
    await Calendar.getInstance(sheets);
})();

export default app;