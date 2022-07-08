import config from './config';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import moment from 'moment-timezone';
import routes from './routes';
import Sheets from './controllers/sheets';
import Calendar from './controllers/calendar';
import SMS from './controllers/sms';

const app = Fastify({
    logger: config.logger
});
app.register(formBodyPlugin);
app.register(routes);

Sheets.configure(config.google);
SMS.configure(config.twilio);
Calendar.configure(config.calendar);

(async () => {
    let sheets = await Sheets.getInstance();
    await sheets.setup();
    let calendar = await Calendar.getInstance();
    await calendar.setup();
})();

export default app;