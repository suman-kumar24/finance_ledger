import fs from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react-native';

import { seedDemo } from '@/seed/demo';
import { dayFromDate } from '@/domain/dates';
import { updateSettings } from '@/data/settings';

import { resetTestDb, seedBasics } from '../../../test/screens';

const APP = path.join(__dirname, '..', '..', 'app');
/** Layouts and the root index (a redirect) need the real router; every other route is a screen. */

function routes(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), `${prefix}${e.name}/`);
    const name = e.name.replace(/\.tsx$/, '');
    const skipped = name === '_layout' || (name === 'index' && prefix === '');
    return e.name.endsWith('.tsx') && !skipped ? [`${prefix}${name}`] : [];
  });
}

const ALL = routes(APP);

describe('every screen renders', () => {
  it('finds the screens', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(26);
  });

  describe.each([
    ['an empty app', () => resetTestDb()],
    [
      'basic data',
      () => {
        const db = resetTestDb();
        seedBasics(db);
        return db;
      },
    ],
    [
      'the demo dataset with every optional feature on',
      () => {
        const db = resetTestDb();
        seedDemo(db, dayFromDate(new Date()));
        updateSettings(db, { smsEnabled: true, backupEnabled: true, lockEnabled: false });
        return db;
      },
    ],
  ])('with %s', (_label, setup) => {
    it.each(ALL)('%s', async (route) => {
      setup();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Screen = require(`@/app/${route}`).default as () => React.JSX.Element;
      const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await render(<Screen />);
      const bad = errors.mock.calls.filter((c) => !String(c[0]).includes('act('));
      errors.mockRestore();
      expect(bad).toEqual([]);
    });
  });
});
