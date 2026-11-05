import type { WorkerReply, WorkerRequest } from './workerMessages';
import type { FramePair, Preset } from './protocol';

type PyCallable = ((...args: (number | string)[]) => unknown) & { destroy(): void };
type PythonRuntime = {
  runPythonAsync(source: string): Promise<unknown>;
  globals: { get(name: string): PyCallable };
};

const scope = self as unknown as {
  postMessage(message: WorkerReply): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
let runtime: PythonRuntime | null = null;

async function initialize(baseUrl: string) {
  const indexURL = new URL('pyodide/', baseUrl).href;
  const moduleUrl = new URL('pyodide.mjs', indexURL).href;
  const sourceUrl = new URL('python/rushhour.py', baseUrl);
  const [module, sourceResponse] = await Promise.all([
    import(/* @vite-ignore */ moduleUrl) as Promise<{
      loadPyodide(options: { indexURL: string }): Promise<PythonRuntime>;
    }>,
    fetch(sourceUrl, { cache: 'no-cache' }),
  ]);
  if (!sourceResponse.ok) throw new Error(`Could not load the Python solver (${sourceResponse.status}).`);

  const [python, source] = await Promise.all([
    module.loadPyodide({ indexURL }),
    sourceResponse.text(),
  ]);
  await python.runPythonAsync(source);
  runtime = python;
}

function callPython(name: string, ...args: (number | string)[]) {
  if (!runtime) throw new Error('The solver is still loading.');
  const fn = runtime.globals.get(name);
  try {
    return fn(...args);
  } finally {
    fn.destroy();
  }
}

scope.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case 'init':
        await initialize(data.baseUrl);
        scope.postMessage({ type: 'ready' });
        break;
      case 'start':
      case 'advance': {
        const result = data.type === 'start'
          ? callPython('start', JSON.stringify(data.board))
          : callPython('advance', data.rounds);
        scope.postMessage({ type: 'frames', id: data.id, frames: JSON.parse(String(result)) as FramePair });
        break;
      }
      case 'reset':
        callPython('reset');
        break;
      case 'random': {
        const result = callPython('random_board', data.seed);
        scope.postMessage({ type: 'preset', id: data.id, preset: JSON.parse(String(result)) as Preset | null });
        break;
      }
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: 'id' in data ? data.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
