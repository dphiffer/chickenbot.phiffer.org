"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app_1 = require("./app");
const app_2 = __importDefault(require("./app"));
(async () => {
    await (0, app_1.init)();
    const configPath = `${path_1.default.dirname(__dirname)}/config/config.json`;
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    app_2.default.listen(config.server);
})();
//# sourceMappingURL=server.js.map