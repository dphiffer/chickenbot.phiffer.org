"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const google_spreadsheet_1 = require("google-spreadsheet");
const fs_1 = require("fs");
const app_1 = __importDefault(require("../app"));
const calendar_1 = __importDefault(require("./calendar"));
const person_1 = __importDefault(require("../models/person"));
const task_1 = __importDefault(require("../models/task"));
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
            this.people.push(new person_1.default(this, row));
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
    async updateAssignment(data) {
        this.validateSecret(data);
        let calendar = await calendar_1.default.getInstance();
        let assignment = calendar.getAssignment(data.date, data.task);
        if (!assignment) {
            throw new Error('No matching assignment found');
        }
        assignment.time = data.time;
        assignment.person = data.person;
        assignment.status = data.status;
        app_1.default.log.info(`Updated '${assignment.task.toLowerCase()}' on ${assignment.date}`);
        return assignment;
    }
    validateSecret(data) {
        return (data.secret && Sheets.config.webhookSecret == data.secret);
    }
    getActivePeople() {
        return this.people.filter(p => (p.status == 'active' || p.status == 'backup'));
    }
    async currentBackup() {
        let [person] = this.people.filter(p => p.status == 'backup');
        if (person) {
            return person;
        }
        // Nobody assigned yet, just pick the first person on the list
        let sheet = this.doc.sheetsByTitle['People'];
        let rows = await sheet.getRows();
        for (let row of rows) {
            row.status = 'backup';
            await row.save();
            [person] = this.people.filter(p => p.name == row.name);
            person.status = 'backup';
            return person;
        }
    }
}
exports.default = Sheets;
//# sourceMappingURL=sheets.js.map