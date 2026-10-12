import { expect } from 'chai';
import { normalizeWindowBounds } from '../../src/shared/windowState';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

describe('desktop/shared/windowState', () => {
    it('accepts a well-formed rectangle unchanged', () => {
        expect(normalizeWindowBounds({ x: 40, y: 30, width: 1280, height: 800 }, WORK_AREA)).to.deep.equal({
            x: 40,
            y: 30,
            width: 1280,
            height: 800,
        });
    });

    it('clamps the size to the work area', () => {
        expect(normalizeWindowBounds({ x: 0, y: 0, width: 4000, height: 4000 }, WORK_AREA)).to.deep.equal({
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        });
    });

    it('enforces a minimum size when the screen is large enough', () => {
        const result = normalizeWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, WORK_AREA);
        expect(result.width).to.equal(480);
        expect(result.height).to.equal(360);
    });

    it('clamps position so the window stays on the work area', () => {
        const result = normalizeWindowBounds({ x: 2000, y: 1500, width: 800, height: 600 }, WORK_AREA);
        expect(result.x).to.equal(1920 - 800);
        expect(result.y).to.equal(1080 - 600);
    });

    it('centers a window that would be entirely off-screen (removed monitor)', () => {
        const result = normalizeWindowBounds({ x: 5000, y: 5000, width: 800, height: 600 }, WORK_AREA);
        expect(result).to.deep.equal({ x: 560, y: 240, width: 800, height: 600 });
    });

    it('handles an offset work area (secondary monitor at a negative origin)', () => {
        const sector = { x: -1920, y: 0, width: 1920, height: 1080 };
        const result = normalizeWindowBounds({ x: -1500, y: 100, width: 800, height: 600 }, sector);
        expect(result.x).to.equal(-1500);
        expect(result.y).to.equal(100);
    });

    it('falls back to work-area defaults for missing/partial input', () => {
        expect(normalizeWindowBounds(null, WORK_AREA)).to.deep.equal({
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        });
        expect(normalizeWindowBounds({}, WORK_AREA)).to.deep.equal({
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        });
    });
});
