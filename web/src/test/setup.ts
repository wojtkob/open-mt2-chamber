import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library does not auto-register cleanup when Vitest runs without
// globals, so every test unmounts its tree here.
afterEach(() => {
    cleanup();
});
