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
const event_1 = __importDefault(require("./models/event"));
class Calendar {
    constructor(sheets) {
        this.events = [];
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
}
exports.default = Calendar;
