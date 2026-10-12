import { expect } from 'chai';
import { resolveStaticDir, resolveStaticDirConfig } from '../../src/shared/paths';

function fakeExists(present: string[]): (filePath: string) => boolean {
    return (filePath) => present.includes(filePath);
}

describe('desktop/shared/paths', () => {
    describe('resolveStaticDir', () => {
        it('returns the first candidate that contains index.html', () => {
            const result = resolveStaticDir(['C:\\one', 'C:\\two', 'C:\\three'], fakeExists(['C:\\two\\index.html']));
            expect(result).to.equal('C:\\two');
        });

        it('skips null/empty candidates and returns null when nothing is present', () => {
            expect(resolveStaticDir([null, '', 'C:\\missing'], () => false)).to.equal(null);
            expect(resolveStaticDir([], () => true)).to.equal(null);
        });
    });

    describe('resolveStaticDirConfig', () => {
        it('reports the winning source for logging', () => {
            const result = resolveStaticDirConfig(
                [
                    { dir: 'C:\\override', source: 'override' },
                    { dir: 'C:\\bundled', source: 'bundled' },
                ],
                fakeExists(['C:\\override\\index.html']),
            );
            expect(result).to.deep.equal({ staticDir: 'C:\\override', source: 'override' });
        });

        it('reports a missing build gracefully', () => {
            const result = resolveStaticDirConfig([{ dir: 'C:\\nowhere', source: 'bundled' }], () => false);
            expect(result.staticDir).to.equal(null);
            expect(result.source).to.contain('none');
        });
    });
});
