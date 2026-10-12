import { expect } from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/shared/settings';
import {
    parseSettingsFile,
    serializeSettings,
    loadSettingsFile,
    saveSettingsFile,
} from '../../src/shared/settingsStore';

describe('desktop/shared/settingsStore', () => {
    it('round-trips settings through the file format', () => {
        const settings = normalizeSettings({ endpoints: { auth: { host: 'srv', port: 1 } } });
        const text = serializeSettings(settings);
        expect(JSON.parse(text).schemaVersion).to.equal(1);
        expect(parseSettingsFile(text)).to.deep.equal(settings);
    });

    it('falls back to defaults for malformed or future-schema files', () => {
        expect(parseSettingsFile('not json')).to.deep.equal(DEFAULT_SETTINGS);
        expect(parseSettingsFile('[1,2]')).to.deep.equal(DEFAULT_SETTINGS);
        expect(parseSettingsFile(JSON.stringify({ schemaVersion: 999, settings: {} }))).to.deep.equal(DEFAULT_SETTINGS);
    });

    it('load/save round-trips through disk with an atomic write', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-mt2-settings-'));
        try {
            const file = path.join(dir, 'profiles', 'settings.json');
            expect(loadSettingsFile(file)).to.deep.equal(DEFAULT_SETTINGS); // missing file

            const custom = normalizeSettings({ endpoints: { game: { host: 'world.srv', port: 9999 } } });
            saveSettingsFile(file, custom);
            expect(loadSettingsFile(file)).to.deep.equal(custom);

            // No temp litter left behind.
            const leftovers = fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'));
            expect(leftovers).to.deep.equal([]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
