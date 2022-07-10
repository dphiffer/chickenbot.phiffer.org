"use strict";
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
    static getInstance() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.instance) {
                return this.instance;
            }
            this.instance = new Sheets();
            return this.instance;
        });
    }
    setup() {
        return __awaiter(this, void 0, void 0, function* () {
            let credsJson = (0, fs_1.readFileSync)(Sheets.config.credentials, 'utf-8');
            let creds = JSON.parse(credsJson);
            yield this.doc.useServiceAccountAuth(creds);
            yield this.doc.loadInfo();
            app_1.default.log.info(`Loading '${this.doc.title}'`);
            let people = yield this.loadPeople();
            let active = this.getActivePeople();
            app_1.default.log.info(`Loaded ${people.length} people (${active.length} are active)`);
            let tasks = yield this.loadTasks();
            app_1.default.log.info(`Loaded ${tasks.length} tasks`);
            return this;
        });
    }
    loadPeople() {
        return __awaiter(this, void 0, void 0, function* () {
            this.people = [];
            let sheet = this.doc.sheetsByTitle['People'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                this.people.push(new person_1.default(this, row));
            }
            return this.people;
        });
    }
    loadTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            this.tasks = [];
            let sheet = this.doc.sheetsByTitle['Tasks'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                this.tasks.push(new task_1.default(row));
            }
            return this.tasks;
        });
    }
    updateAssignment(data) {
        return __awaiter(this, void 0, void 0, function* () {
            let calendar = yield calendar_1.default.getInstance();
            let assignment = calendar.getAssignment(data.date, data.task);
            if (!assignment) {
                throw new Error('No matching assignment found');
            }
            assignment.time = data.time;
            assignment.person = data.person;
            assignment.status = data.status;
            app_1.default.log.info(`Updated '${assignment.task.toLowerCase()}' on ${assignment.date}`);
            return assignment;
        });
    }
    getActivePeople() {
        return this.people.filter(p => (p.status == 'active' || p.status == 'backup'));
    }
    currentBackup() {
        return __awaiter(this, void 0, void 0, function* () {
            let [person] = this.people.filter(p => p.status == 'backup');
            if (person) {
                return person;
            }
            // Nobody assigned yet, just pick the first person on the list
            let sheet = this.doc.sheetsByTitle['People'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                row.status = 'backup';
                yield row.save();
                [person] = this.people.filter(p => p.name == row.name);
                person.status = 'backup';
                return person;
            }
        });
    }
}
exports.default = Sheets;
//# sourceMappingURL=sheets.js.map