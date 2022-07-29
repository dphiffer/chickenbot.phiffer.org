"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const google_spreadsheet_1 = require("google-spreadsheet");
const person_1 = require("../models/person");
const fs_1 = require("fs");
const calendar_1 = __importDefault(require("./calendar"));
const person_2 = __importDefault(require("../models/person"));
const task_1 = __importDefault(require("../models/task"));
const app_1 = __importDefault(require("../app"));
const messages_1 = __importDefault(require("./messages"));
class Sheets {
    constructor() {
        this.people = [];
        this.tasks = [];
        this.doc = new google_spreadsheet_1.GoogleSpreadsheet(Sheets.config.spreadsheetId);
        this.webhookSecret = Sheets.config.webhookSecret;
    }
    static configure(config) {
        this.config = config;
    }
    static async getInstance() {
        if (this.instance) {
            return this.instance;
        }
        this.instance = new Sheets();
        return this.instance;
    }
    get id() {
        return Sheets.config.spreadsheetId;
    }
    async setup() {
        let credsJson = (0, fs_1.readFileSync)(Sheets.config.credentials, 'utf-8');
        let creds = JSON.parse(credsJson);
        await this.doc.useServiceAccountAuth(creds);
        await this.doc.loadInfo();
        app_1.default.log.info(`Loading '${this.doc.title}'`);
        let people = await this.loadPeople();
        let active = this.getActivePeople();
        app_1.default.log.info(`Loaded ${people.length} people (${active.length} are active)`);
        let tasks = await this.loadTasks();
        app_1.default.log.info(`Loaded ${tasks.length} tasks`);
        return this;
    }
    async loadPeople() {
        this.people = [];
        let sheet = this.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            this.people.push(new person_2.default(this, row));
        }
        return this.people;
    }
    async loadTasks() {
        this.tasks = [];
        let sheet = this.doc.sheetsByTitle['Tasks'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            this.tasks.push(new task_1.default(row));
        }
        return this.tasks;
    }
    async updateFromWebhook(data) {
        app_1.default.log.info(data);
        this.validateSecret(data);
        let updated;
        if (data.assignment) {
            updated = await this.updateAssignment(data.assignment);
        }
        else if (data.person) {
            updated = await this.updatePerson(data.person);
        }
        return updated;
    }
    async updateAssignment(data) {
        let calendar = await calendar_1.default.getInstance();
        let assignment = calendar.getAssignment(data.date, data.task);
        if (!assignment) {
            throw new Error('No matching assignment found');
        }
        assignment.time = data.time;
        assignment.person = data.person;
        assignment.status = data.status;
        app_1.default.log.info(`Updated '${assignment.task.toLowerCase()}' on ${assignment.date}`);
        let messages = messages_1.default.getInstance();
        if (messages.isScheduling) {
            app_1.default.log.info('is scheduling');
            let [person] = this.people.filter(p => p.name == data.person);
            if (person) {
                app_1.default.log.info('found person');
                let assigned = calendar.assignments.filter(a => a.person == data.person);
                console.log(assigned);
                app_1.default.log.info(`Updated ${person.name}'s schedule`);
                person.setSchedule(assigned);
            }
        }
        return assignment;
    }
    async updatePerson(data) {
        let [person] = this.people.filter(p => p.name == data.name);
        if (!person) {
            throw new Error(`Person '${data.name}' not found.`);
        }
        person.phone = person.normalizePhone(data.phone);
        person.status = data.status;
        person.away = data.away;
        app_1.default.log.info(`Updated '${person.name}'`);
        return person;
    }
    validateSecret(data) {
        return data.secret && Sheets.config.webhookSecret == data.secret;
    }
    getActivePeople() {
        return this.people.filter(p => p.status != person_1.PersonStatus.INACTIVE);
    }
    async currentBackup() {
        let [person] = this.people.filter(p => p.status == person_1.PersonStatus.BACKUP);
        if (person) {
            return person;
        }
        // Nobody assigned yet, just pick the first person on the list
        let sheet = this.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            row.status = person_1.PersonStatus.BACKUP;
            await row.save();
            [person] = this.people.filter(p => p.name == row.name);
            person.status = person_1.PersonStatus.BACKUP;
            return person;
        }
    }
}
exports.default = Sheets;
//# sourceMappingURL=sheets.js.map