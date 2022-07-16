import { assert } from 'chai';
import Calendar from '../controllers/calendar.js';

let parsed = Calendar.parseDay('7');
assert.equal(parsed, false);

parsed = Calendar.parseDay('28');
assert.equal(parsed, false);
