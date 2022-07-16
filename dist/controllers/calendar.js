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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const moment = __importStar(require("moment-timezone"));
const suntimes = __importStar(require("suntimes"));
const sheets_1 = __importDefault(require("./sheets"));
const assignment_1 = __importDefault(require("../models/assignment"));
const sms_1 = __importDefault(require("./sms"));
const log_1 = require("../log");
class Calendar {
    constructor() {
        this.assignments = [];
        this.queue = [];
        this.index = 0;
        this.timezone = Calendar.config.timezone;
        this.latitude = Calendar.config.latitude;
        this.longitude = Calendar.config.longitude;
        moment.tz.setDefault(Calendar.config.timezone);
    }
    static configure(config) {
        this.config = config;
    }
    static async getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Calendar();
        return this.instance;
    }
    static parseDay(input) {
        let today = moment.default().format('YYYY-MM-DD');
        input = input.trim();
        let formats = ['dd', 'ddd', 'dddd', 'M/D', 'YYYY-MM-DD'];
        for (let format of formats) {
            if (format == 'M/D' && input.indexOf('/') == -1) {
                continue;
            }
            else if (format == 'YYYY-MM-DD' &&
                !input.match(/^\d{4}-\d{2}-\d{2}$/)) {
                continue;
            }
            if (moment.default(input, format).isValid()) {
                console.log(format);
                let day = moment.default(input, format);
                if (day.format('YYYY-MM-DD') > today) {
                    return day.format('YYYY-MM-DD');
                }
                if (day.format('YYYY-MM-DD') == today ||
                    format == 'YYYY-MM-DD') {
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
    async setup() {
        let upcoming = await this.loadAssignments('Upcoming');
        (0, log_1.log)(`Loaded ${upcoming.length} upcoming assignments`);
        let archived = await this.loadAssignments('Archive');
        (0, log_1.log)(`Loaded ${archived.length} archived assignments`);
        this.markTaskDates();
        (0, log_1.log)('Setting up assignment check interval');
        setInterval(async () => {
            await this.checkAssignments();
        }, 60 * 1000);
        await this.checkAssignments();
        return this;
    }
    async loadAssignments(sheetTitle) {
        let loaded = [];
        let sheets = await sheets_1.default.getInstance();
        let sheet = sheets.doc.sheetsByTitle[sheetTitle];
        let rows = await sheet.getRows();
        for (let row of rows) {
            let assignment = this.addAssignment(sheetTitle, row);
            loaded.push(assignment);
        }
        return loaded;
    }
    addAssignment(sheet, row) {
        let assignment = new assignment_1.default(sheet, row);
        this.assignments.push(assignment);
        return assignment;
    }
    getAssignment(date, task) {
        for (let assignment of this.assignments) {
            if (assignment.date == date && assignment.task == task) {
                return assignment;
            }
        }
    }
    async scheduleTasks() {
        let sheets = await sheets_1.default.getInstance();
        await sheets.loadPeople();
        await sheets.loadTasks();
        await this.setupQueue();
        await this.markTaskDates();
        await this.archiveAssignments();
        let assignments = await this.scheduleForWeek();
        await this.addUpcoming(assignments);
        await this.setAssigned(assignments);
    }
    async setupQueue() {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        this.queue = people.map(p => p.name);
        this.queue.sort(() => Math.random() - 0.5);
        this.index = 0;
    }
    async markTaskDates() {
        let sheets = await sheets_1.default.getInstance();
        let fmt = 'YYYY-MM-DD';
        for (let assignment of this.assignments) {
            let date = moment.default(assignment.date, 'M/D');
            let [task] = sheets.tasks.filter(t => t.name == assignment.task);
            if (task && (!task.lastRun || task.lastRun < date.format(fmt))) {
                task.lastRun = date.format(fmt);
                task.lastPerson = assignment.person;
                task.nextRun = date.add(task.frequency, 'days').format(fmt);
            }
        }
        let today = moment.default().format(fmt);
        for (let task of sheets.tasks) {
            if (!task.lastRun) {
                task.lastRun = moment.default().format(fmt);
                task.nextRun = moment
                    .default()
                    .add(task.frequency, 'days')
                    .format(fmt);
            }
            let nextRun = moment.default(task.nextRun, fmt);
            while (nextRun.format(fmt) < today) {
                nextRun.add(task.frequency, 'days');
            }
            task.nextRun = nextRun.format(fmt);
        }
    }
    async scheduleForWeek() {
        let now = moment.default();
        let assignments = [];
        for (let i = 0; i < 7; i++) {
            let date = now.add(1, 'days');
            let scheduled = await this.scheduleForDate(date);
            assignments = [...assignments, ...scheduled];
        }
        return assignments;
    }
    async scheduleForDate(date) {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        let iso8601 = 'YYYY-MM-DD';
        let locale = 'M/D';
        let assignments = [];
        for (let task of sheets.tasks) {
            if (task.nextRun && task.nextRun <= date.format(iso8601)) {
                let person = await this.selectPerson(task, people, date.format(iso8601));
                let assignment = this.addAssignment('Upcoming', new assignment_1.default('Upcoming', {
                    date: date.format(locale),
                    time: this.getScheduleTime(task.time, date),
                    task: task.name,
                    person: person.name,
                    status: 'scheduled',
                }));
                assignments.push(assignment);
            }
        }
        this.markTaskDates();
        return assignments;
    }
    async selectPerson(task, people, date, iterations = 0) {
        let name = this.queue[this.index];
        this.index = (this.index + 1) % this.queue.length;
        let [person] = people.filter(p => p.name == name);
        if (iterations == people.length) {
            let sheets = await sheets_1.default.getInstance();
            let backup = await sheets.currentBackup();
            if (backup) {
                person = backup;
            }
            else {
                throw new Error('Not enough people to complete the schedule');
            }
        }
        else if (name == task.lastPerson) {
            person = await this.selectPerson(task, people, date, iterations + 1);
        }
        else if (person.isAway(date, task.time)) {
            person = await this.selectPerson(task, people, date, iterations + 1);
        }
        return person;
    }
    getScheduleTime(time, date) {
        if (time == 'sunset') {
            let sunsetUTC = suntimes.getSunsetDateTimeUtc(date.toDate(), this.latitude, this.longitude);
            let sunsetLocal = moment.tz(sunsetUTC, 'UTC').add(10, 'minutes');
            return sunsetLocal.tz(this.timezone).format('h:mm A');
        }
        else {
            return time;
        }
    }
    async archiveAssignments() {
        let sheets = await sheets_1.default.getInstance();
        let upcoming = sheets.doc.sheetsByTitle['Upcoming'];
        let archive = sheets.doc.sheetsByTitle['Archive'];
        let today = moment.default().format('M/D');
        let rows = await upcoming.getRows();
        let pending = [];
        for (let row of rows) {
            let assignment = {
                date: row.date,
                time: row.time,
                task: row.task,
                person: row.person,
                status: row.status,
            };
            await archive.addRow(assignment);
            if (assignment.status == 'pending' ||
                assignment.status == 'scheduled') {
                pending.push(assignment);
            }
        }
        await upcoming.clearRows();
        await upcoming.addRows(pending);
    }
    async addUpcoming(assignments) {
        let sheets = await sheets_1.default.getInstance();
        let sheet = sheets.doc.sheetsByTitle['Upcoming'];
        for (let assignment of assignments) {
            await sheet.addRow({
                date: assignment.date,
                time: assignment.time,
                task: assignment.task,
                person: assignment.person,
                status: assignment.status,
            });
        }
    }
    async setAssigned(assignments) {
        let sheets = await sheets_1.default.getInstance();
        let people = sheets.getActivePeople();
        for (let person of people) {
            let assigned = [];
            for (let assignment of assignments) {
                if (assignment.person == person.name) {
                    let date = moment
                        .default(assignment.date, 'M/D')
                        .format('ddd M/D');
                    assigned.push(`${date}: ${assignment.task}`);
                }
            }
            person.schedule = `Hi ${person.name}, here are your scheduled chicken tasks for this week:\n${assigned.join('\n')}`;
        }
        return people;
    }
    async checkAssignments() {
        (0, log_1.log)('Checking assignments');
        let sheets = await sheets_1.default.getInstance();
        let assignmentsDue = [];
        let today = moment.default().format('YYYY-MM-DD');
        let now = moment.default().format('HH:mm:ss');
        for (let assignment of this.assignments) {
            if (assignment.status != 'scheduled') {
                continue;
            }
            let dateTime = moment.default(`${assignment.date} ${assignment.time}`, 'M/D h:mm A');
            if (dateTime.format('YYYY-MM-DD') == today &&
                dateTime.format('HH:mm:ss') <= now) {
                assignmentsDue.push(assignment);
                (0, log_1.log)(`due: ${assignment.task.toLowerCase()}`);
            }
        }
        if (assignmentsDue.length > 0) {
            let sms = sms_1.default.getInstance();
            await sms.sendAssignments(assignmentsDue);
        }
    }
}
exports.default = Calendar;
//# sourceMappingURL=calendar.js.map