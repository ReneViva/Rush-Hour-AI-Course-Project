import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const pairs = [
  ...['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'pyodide-lock.json', 'python_stdlib.zip'].map(
    (file) => [join('node_modules', 'pyodide', file), join('public', 'pyodide', file)],
  ),
  [join('node_modules', 'react', 'LICENSE'), join('public', 'licenses', 'React.txt')],
  [join('node_modules', 'react-dom', 'LICENSE'), join('public', 'licenses', 'ReactDOM.txt')],
  [join('node_modules', '@fontsource-variable', 'manrope', 'LICENSE'), join('public', 'licenses', 'Manrope.txt')],
  [join('python', 'rushhour.py'), join('public', 'python', 'rushhour.py')],
];

await Promise.all(pairs.map(async ([source, destination]) => {
  const target = join(project, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(project, source), target);
}));
