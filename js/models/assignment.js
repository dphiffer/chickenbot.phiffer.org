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
const sheets_1 = __importDefault(require("../controllers/sheets"));
class Assignment {
    constructor(sheet, data) {
        this.sheet = sheet;
        this.date = data.date;
        this.time = data.time;
        this.task = data.task;
        this.person = data.person;
        this.status = data.status;
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            let sheets = yield sheets_1.default.getInstance();
            let sheet = sheets.doc.sheetsByTitle[this.sheet];
            let rows = yield sheet.getRows();
            let id = `${this.date} ${this.task}`;
            for (let row of rows) {
                if (id == `${row.date} ${row.task}`) {
                    row.time = this.time;
                    row.person = this.person;
                    row.status = this.status;
                    yield row.save();
                }
            }
        });
    }
    snooze() {
        return __awaiter(this, void 0, void 0, function* () {
            this.status = 'scheduled';
            this.time = moment.default().add('1', 'minutes').format('h:mm A');
            yield this.save();
            return this.time;
        });
    }
}
exports.default = Assignment;
//# sourceMappingURL=assignment.js.map