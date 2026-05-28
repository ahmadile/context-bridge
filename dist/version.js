"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPackageVersion = getPackageVersion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Single source of truth for the CLI version.
 * Reads it from package.json at runtime (works from dist/ too).
 */
function getPackageVersion() {
    try {
        const pkgPath = path_1.default.resolve(__dirname, '..', 'package.json');
        const raw = fs_1.default.readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
