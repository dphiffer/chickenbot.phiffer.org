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
const calendar_1 = __importDefault(require("./calendar"));
const person_1 = __importDefault(require("./models/person"));
const task_1 = __importDefault(require("./models/task"));
class Sheets {
    constructor(config) {
        this.people = [];
        this.tasks = [];
        this.doc = new google_spreadsheet_1.GoogleSpreadsheet(config.spreadsheetId);
        this.webhookSecret = config.webhookSecret;
    }
    static getInstance(config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.instance) {
                return this.instance;
            }
            this.instance = new Sheets(config);
            let credsJson = (0, fs_1.readFileSync)(config.credentials, 'utf-8');
            let creds = JSON.parse(credsJson);
            yield this.instance.doc.useServiceAccountAuth(creds);
            yield this.instance.doc.loadInfo();
            console.log(`Initialized ${this.instance.doc.title}`);
            yield this.instance.setup();
            return this.instance;
        });
    }
    setup() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.setupPeople();
            yield this.setupTasks();
            return this;
        });
    }
    setupPeople() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheet = this.doc.sheetsByTitle['People'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                this.people.push(new person_1.default(this, row));
            }
        });
    }
    setupTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheet = this.doc.sheetsByTitle['Tasks'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                this.tasks.push(new task_1.default(row));
            }
        });
    }
    updateEvent(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.secret != this.webhookSecret) {
                throw new Error('Webhook secret did not match');
            }
            let calendar = yield calendar_1.default.getInstance(this);
            let event = calendar.getEvent(data.date, data.task);
            if (!event) {
                throw new Error('No matching event found');
            }
            event.time = data.time;
            event.person = data.person;
            event.status = data.status;
            return event;
        });
    }
    currentBackup() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let person of this.people) {
                if (person.status == 'backup') {
                    return person;
                }
            }
            // Nobody assigned yet, just pick the first person on the list
            let sheet = this.doc.sheetsByTitle['People'];
            let rows = yield sheet.getRows();
            for (let row of rows) {
                row.status = 'backup';
                yield row.save();
                this.people[row.name].status = 'backup';
                return this.people[row.name];
            }
        });
    }
}
exports.default = Sheets;
