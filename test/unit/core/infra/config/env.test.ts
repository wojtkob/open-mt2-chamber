import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadEnvFile, parseEnvFile, resetEnvFileCache } from '@/core/infra/config/env';
import { expect } from 'chai';

describe('env file loader', () => {
    const createdFiles: string[] = [];
    const TEST_KEYS = ['OPEN_MT2_TEST_A', 'OPEN_MT2_TEST_B'];

    const writeEnvFile = (content: string): string => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'open-mt2-env-'));
        const file = path.join(directory, '.env');
        fs.writeFileSync(file, content, 'utf8');
        createdFiles.push(directory);
        return file;
    };

    afterEach(() => {
        for (const key of TEST_KEYS) delete process.env[key];
        for (const directory of createdFiles) fs.rmSync(directory, { recursive: true, force: true });
        createdFiles.length = 0;
        resetEnvFileCache();
    });

    describe('parseEnvFile', () => {
        it('reads plain key=value pairs', () => {
            expect(parseEnvFile('A=1\nB=two')).to.deep.equal({ A: '1', B: 'two' });
        });

        it('skips blank lines and comments', () => {
            expect(parseEnvFile('\n# a comment\n\nA=1\n  # indented comment\nB=2\n')).to.deep.equal({
                A: '1',
                B: '2',
            });
        });

        it('accepts an export prefix', () => {
            expect(parseEnvFile('export A=1')).to.deep.equal({ A: '1' });
        });

        it('keeps spaces inside quoted values', () => {
            expect(parseEnvFile('A="hello world"')).to.deep.equal({ A: 'hello world' });
        });

        it('expands escapes inside double quotes', () => {
            expect(parseEnvFile('A="line1\\nline2"')).to.deep.equal({ A: 'line1\nline2' });
        });

        it('keeps single quoted values literal', () => {
            expect(parseEnvFile("A='no \\n escape'")).to.deep.equal({ A: 'no \\n escape' });
        });

        it('trims whitespace around the separator and the value', () => {
            expect(parseEnvFile('  A  =  1  ')).to.deep.equal({ A: '1' });
        });

        it('drops a trailing comment from an unquoted value', () => {
            expect(parseEnvFile('A=1 # note')).to.deep.equal({ A: '1' });
        });

        it('keeps a hash that is part of the value', () => {
            expect(parseEnvFile('A=abc#def')).to.deep.equal({ A: 'abc#def' });
        });

        it('keeps everything after the first separator', () => {
            expect(parseEnvFile('A=1=2')).to.deep.equal({ A: '1=2' });
        });

        it('handles CRLF line endings', () => {
            expect(parseEnvFile('A=1\r\nB=2\r\n')).to.deep.equal({ A: '1', B: '2' });
        });

        it('allows an empty value', () => {
            expect(parseEnvFile('A=')).to.deep.equal({ A: '' });
        });

        it('ignores a line without a separator', () => {
            expect(parseEnvFile('NOT_A_PAIR\nA=1')).to.deep.equal({ A: '1' });
        });

        it('ignores a line whose key is not a valid identifier', () => {
            expect(parseEnvFile('1BAD=1\nA-B=1\nOK=1')).to.deep.equal({ OK: '1' });
        });
    });

    describe('loadEnvFile', () => {
        it('applies the file to process.env', () => {
            const file = writeEnvFile('OPEN_MT2_TEST_A=alpha\nOPEN_MT2_TEST_B=beta\n');

            loadEnvFile(file);

            expect(process.env.OPEN_MT2_TEST_A).to.equal('alpha');
            expect(process.env.OPEN_MT2_TEST_B).to.equal('beta');
        });

        it('never overrides a variable that is already set', () => {
            const file = writeEnvFile('OPEN_MT2_TEST_A=from-file\n');
            process.env.OPEN_MT2_TEST_A = 'from-environment';

            loadEnvFile(file);

            expect(process.env.OPEN_MT2_TEST_A).to.equal('from-environment');
        });

        it('fills in a variable that is set to an empty string only from the file when absent', () => {
            const file = writeEnvFile('OPEN_MT2_TEST_A=from-file\n');

            loadEnvFile(file);

            expect(process.env.OPEN_MT2_TEST_A).to.equal('from-file');
        });

        it('reads the file only once per path', () => {
            const file = writeEnvFile('OPEN_MT2_TEST_A=first\n');

            loadEnvFile(file);
            fs.writeFileSync(file, 'OPEN_MT2_TEST_A=second\n', 'utf8');
            loadEnvFile(file);

            expect(process.env.OPEN_MT2_TEST_A).to.equal('first');
        });

        it('returns undefined for a file that does not exist', () => {
            expect(loadEnvFile(path.join(os.tmpdir(), 'open-mt2-missing-env-file'))).to.be.undefined;
        });

        it('returns the path it loaded', () => {
            const file = writeEnvFile('OPEN_MT2_TEST_A=alpha\n');

            expect(loadEnvFile(file)).to.equal(file);
        });
    });
});
