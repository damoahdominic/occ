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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.overrideConfigPath = overrideConfigPath;
exports.resolveConfigPath = resolveConfigPath;
exports.getDefaultConfigPath = getDefaultConfigPath;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
let customPath;
const DEFAULT_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");
function expandHome(targetPath) {
    if (!targetPath)
        return targetPath;
    if (targetPath.startsWith("~")) {
        return path.join(os.homedir(), targetPath.slice(1));
    }
    return targetPath;
}
function normalizePath(targetPath) {
    if (!targetPath)
        return targetPath;
    const expanded = expandHome(targetPath);
    if (process.platform === "win32" && expanded) {
        return expanded.replace(/\\/g, "/");
    }
    return expanded;
}
function overrideConfigPath(p) {
    customPath = p ? normalizePath(p) : undefined;
}
function resolveConfigPath() {
    if (customPath)
        return customPath;
    const fromSettings = vscode.workspace.getConfiguration("openclaw").get("configPath");
    if (fromSettings) {
        customPath = normalizePath(fromSettings);
        if (customPath) {
            return customPath;
        }
    }
    return DEFAULT_PATH;
}
function getDefaultConfigPath() {
    return DEFAULT_PATH;
}
//# sourceMappingURL=config-path.js.map