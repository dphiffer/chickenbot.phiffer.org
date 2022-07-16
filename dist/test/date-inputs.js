"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const calendar_js_1 = __importDefault(require("../controllers/calendar.js"));
let parsed = calendar_js_1.default.parseDay('7');
chai_1.assert.equal(parsed, false);
parsed = calendar_js_1.default.parseDay('28');
chai_1.assert.equal(parsed, false);
//# sourceMappingURL=date-inputs.js.map