import { expect, it } from 'vitest';
import { dependances } from '../../src/outils/developpement.js';

it('repère les imports Humalis et CSS relatifs', () => {
  expect(dependances('/tmp/site/main.humalis', 'utiliser fichier "./pages/a.humalis"\nutiliser style "./theme.css"'))
    .toEqual(['/tmp/site/pages/a.humalis', '/tmp/site/theme.css']);
});
