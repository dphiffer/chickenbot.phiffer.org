"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment = __importStar(require("moment-timezone"));
const suntimes = __importStar(require("suntimes"));
const event_1 = __importDefault(require("./models/event"));
const config_1 = __importDefault(require("./config"));
class Calendar {
    constructor(sheets) {
        this.events = [];
        this.queue = [];
        this.index = 0;
        this.sheets = sheets;
    }
    static getInstance(sheets) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.instance) {
                return this.instance;
            }
            this.instance = new Calendar(sheets);
            yield this.instance.setup();
            return this.instance;
        });
    }
    static parseDay(input) {
        let today = moment.default().format('YYYY-MM-DD');
        input = input.trim();
        let formats = ['dd', 'ddd', 'dddd', 'M/D', 'YYYY-MM-DD'];
        for (let format of formats) {
            if (moment.default(input, format).isValid()) {
                let day = moment.default(input, format);
                if (day.format('YYYY-MM-DD') > today) {
                    return day.format('YYYY-MM-DD');
                }
                if (day.format('YYYY-MM-DD') == today || format == 'YYYY-MM-DD') {
                    return false;
                }
                else if (format == 'M/D') {
                    day.add(1, 'years');
                    return day.format('YYYY-MM-DD');
                }
                else {
                    day.add(1, 'weeks');
                    return day.format('YYYY-MM-DD');
                }
            }
        }
        return false;
    }
    setup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addEvents('Upcoming');
            yield this.addEvents('Archive');
            this.markTaskDates();
            return this;
        });
    }
    addEvents(sheetTitle) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheet = this.sheets.doc.sheetsByTitle[sheetTitle];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                this.addEvent(sheetTitle, row);
            }
        });
    }
    addEvent(sheet, row) {
        let event = new event_1.default(sheet, row);
        this.events.push(event);
        return event;
    }
    getEvent(date, task) {
        for (let event of this.events) {
            if (event.date == date && event.task == task) {
                return event;
            }
        }
    }
    scheduleTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sheets.loadPeople();
            yield this.sheets.loadTasks();
            this.setupQueue();
            this.markTaskDates();
            yield this.archiveCompletedEvents();
            let events = this.scheduleEventsForWeek();
            yield this.addUpcomingEvents(events);
            return this.setAssignedEvents(events);
        });
    }
    setupQueue() {
        let people = this.sheets.getActivePeople();
        this.queue = people.map(p => p.name);
        this.queue.sort(() => Math.random() - 0.5);
        this.index = 0;
    }
    markTaskDates() {
        let tasks = this.sheets.tasks;
        let fmt = 'YYYY-MM-DD';
        for (let event of this.events) {
            let eventDate = moment.default(event.date, 'M/D');
            let [task] = tasks.filter(t => t.name == event.task);
            if (task && (!task.lastRun || task.lastRun < eventDate.format(fmt))) {
                task.lastRun = eventDate.format(fmt);
                task.lastPerson = event.person;
                task.nextRun = eventDate.add(task.frequency, 'days').format(fmt);
            }
        }
        let today = moment.default().format(fmt);
        for (let task of tasks) {
            if (!task.lastRun) {
                task.lastRun = moment.default().format(fmt);
                task.nextRun = moment.default().add(task.frequency, 'days').format(fmt);
            }
            let nextRun = moment.default(task.nextRun, fmt);
            while (nextRun.format(fmt) < today) {
                nextRun.add(task.frequency, 'days');
            }
            task.nextRun = nextRun.format(fmt);
        }
    }
    scheduleEventsForWeek() {
        let now = moment.default();
        let events = [];
        for (let i = 0; i < 7; i++) {
            let date = now.add(1, 'days');
            let scheduled = this.scheduleEventsOnDate(date);
            events = [...events, ...scheduled];
        }
        return events;
    }
    scheduleEventsOnDate(date) {
        let people = this.sheets.getActivePeople();
        let iso8601 = 'YYYY-MM-DD';
        let locale = 'M/D';
        let events = [];
        for (let task of this.sheets.tasks) {
            if (task.nextRun && task.nextRun <= date.format(iso8601)) {
                let person = this.selectPerson(task, people, date.format(iso8601));
                let event = this.addEvent('Upcoming', new event_1.default('Upcoming', {
                    date: date.format(locale),
                    time: this.getEventTime(task.time, date),
                    task: task.name,
                    person: person.name,
                    status: 'scheduled'
                }));
                events.push(event);
            }
        }
        this.markTaskDates();
        return events;
    }
    selectPerson(task, people, date) {
        let name = this.queue[this.index];
        this.index++;
        if (this.index == this.queue.length) {
            this.index = 0;
        }
        let [person] = people.filter(p => p.name == name);
        if (name == task.lastPerson) {
            return this.selectPerson(task, people, date);
        }
        else if (person.isAway(date)) {
            return this.selectPerson(task, people, date);
        }
        return person;
    }
    getEventTime(time, date) {
        if (time == 'sunset') {
            let sunsetUTC = suntimes.getSunsetDateTimeUtc(date.toDate(), config_1.default.latitude, config_1.default.longitude);
            let sunsetLocal = moment.tz(sunsetUTC, 'UTC').add(10, 'minutes');
            return sunsetLocal.tz(config_1.default.timezone).format('h:mm A');
        }
        else {
            return time;
        }
    }
    archiveCompletedEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            let upcoming = this.sheets.doc.sheetsByTitle['Upcoming'];
            let archive = this.sheets.doc.sheetsByTitle['Archive'];
            let today = moment.default().format('M/D');
            let rows = yield upcoming.getRows();
            let pending = [];
            for (let row of rows) {
                let event = {
                    date: row.date,
                    time: row.time,
                    task: row.task,
                    person: row.person,
                    status: row.status
                };
                yield archive.addRow(event);
                if (event.status != 'complete') {
                    pending.push(event);
                }
            }
            yield upcoming.clearRows();
            yield upcoming.addRows(pending);
        });
    }
    addUpcomingEvents(events) {
        return __awaiter(this, void 0, void 0, function* () {
            let sheet = this.sheets.doc.sheetsByTitle['Upcoming'];
            for (let event of events) {
                yield sheet.addRow(event);
            }
        });
    }
    setAssignedEvents(events) {
        let people = this.sheets.getActivePeople();
        for (let person of people) {
            let assigned = [];
            for (let event of events) {
                if (event.person == person.name) {
                    let date = moment.default(event.date, 'M/D').format('ddd M/D');
                    assigned.push(`${date}: ${event.task}`);
                }
            }
            person.assigned = `Hi ${person.name}, here are your scheduled chicken tasks for this week:\n${assigned.join('\n')}`;
        }
        return people;
    }
}
exports.default = Calendar;
//# sourceMappingURL=calendar.js.map