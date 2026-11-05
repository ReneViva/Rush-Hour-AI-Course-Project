import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4176';

async function openSite(page: Page, path = '/') {
  const external: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    external.push(url.href);
    return route.abort();
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Rush Hour', exact: true })).toBeVisible();
  return external;
}

async function openSearch(page: Page) {
  await page.getByRole('button', { name: 'Compare BFS & A*' }).click();
  await expect(page.getByRole('heading', { name: 'Compare the searches' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
}

async function checkA11y(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
}

test('plays with pointer and keyboard; edits and validates a custom board', async ({ page }, testInfo) => {
  await openSite(page);
  await page.screenshot({ path: testInfo.outputPath('play.png'), fullPage: true, animations: 'disabled' });
  await checkA11y(page);

  const vehicle = page.getByRole('button', { name: /^Vehicle F,/ });
  await vehicle.click();
  await expect(vehicle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Vehicle F selected' })).toBeVisible();
  await expect(vehicle.locator('.vehicle-body')).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('selected-car.png'), fullPage: true, animations: 'disabled' });
  const piece = (await vehicle.boundingBox())!;
  const grid = (await page.locator('.puzzle-grid').boundingBox())!;
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2 + grid.height / 3, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('moved down 2 cells');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.move-counter')).toHaveText('0 moves');

  await page.getByLabel('Puzzle library').selectOption('beginner-02');
  const target = page.getByRole('button', { name: /^Target vehicle X,/ });
  await target.focus();
  await target.press('Enter');
  const longest = page.getByRole('button', { name: 'Right 4', exact: true });
  await longest.focus();
  await longest.press('Enter');
  await expect(page.getByRole('status')).toContainText('You made it out in 1 move');
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByLabel('Puzzle library').selectOption('beginner-01');
  await page.getByRole('button', { name: 'Edit board' }).click();
  await page.getByLabel('Columns').selectOption('4');
  await expect(page.getByRole('group', { name: 'Board size' }).getByRole('status')).toContainText('outside the board');
  await expect(page.getByLabel('Columns')).toHaveValue('6');
  await page.screenshot({ path: testInfo.outputPath('invalid-edit.png'), fullPage: true, animations: 'disabled' });

  await page.getByLabel('Columns').selectOption('7');
  await page.getByLabel('Rows').selectOption('7');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await page.getByLabel('Orientation').selectOption('V');
  await page.getByRole('button', { name: 'Choose a cell' }).click();
  await expect(page.locator('[data-cell][tabindex="0"]')).toBeFocused();
  await page.getByRole('button', { name: 'Place at row A, column 7' }).click();
  await expect(page.getByRole('button', { name: 'Remove vehicle I' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove vehicle I' }).click();
  await page.getByLabel('Selected vehicle').selectOption('X');
  await page.getByLabel('Anchor row').selectOption('6');
  await page.getByLabel('Length').selectOption('4');
  await expect(target).toHaveAccessibleName(/4 cells, row G/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.board-meta')).toContainText('7 × 7');
  await expect(page.locator('.board-meta')).toContainText('Custom board');
});

test('pauses in-flight search replies, steps exactly once, and rejects stale work', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const wrapped = new WeakMap<Worker, { requests: Set<number> }>();
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        wrapped.set(this, { requests: new Set() });
      }
      postMessage(message: { type: string; id?: number }) {
        const state = wrapped.get(this)!;
        if (message.type === 'advance' && message.id !== undefined) state.requests.add(message.id);
        super.postMessage(message);
      }
      set onmessage(listener: ((this: Worker, event: MessageEvent) => unknown) | null) {
        if (!listener) return;
        this.addEventListener('message', (event) => {
          const state = wrapped.get(this)!;
          if (event.data.type === 'frames' && state.requests.delete(event.data.id)) {
            window.setTimeout(() => listener.call(this, event), 650);
          } else {
            listener.call(this, event);
          }
        });
      }
    };
  });
  const external = await openSite(page);
  await openSearch(page);
  const bfs = page.getByTestId('bfs-expanded');
  const astar = page.getByTestId('astar-expanded');
  await expect(bfs).toHaveText('0');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Search paused')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
  await expect(bfs).toHaveText('0');
  await expect(astar).toHaveText('0');
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(bfs).toHaveText('1');
  await expect(astar).toHaveText('1');
  await page.screenshot({ path: testInfo.outputPath('search.png'), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Restart search' }).click();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
  await page.waitForTimeout(800);
  await expect(bfs).toHaveText('0');
  await expect(astar).toHaveText('0');
  await checkA11y(page);
  expect(external).toEqual([]);
});

test('uses the offline static bundle in a subdirectory and replays the real Python solution', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const external = await openSite(page, '/lab/');
  await openSearch(page);
  await page.getByRole('button', { name: 'Finish search' }).click();
  await expect(page.getByText(/Both found a 4-move solution/)).toBeVisible();
  await page.getByRole('button', { name: 'Replay A* solution' }).click();
  const timeline = page.getByRole('slider', { name: 'Solution timeline' });
  await expect(page.getByRole('heading', { name: 'Move 0 of 4' })).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(timeline).toHaveValue('1');
  await expect(page.locator('.replay-description')).toContainText(/moved (up|down|left|right)/);
  await page.screenshot({ path: testInfo.outputPath('paused-replay.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await timeline.press('End');
  await expect(timeline).toHaveValue('4');
  await expect(page.getByText('At the exit', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await checkA11y(page);
  await page.screenshot({ path: testInfo.outputPath('completion.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Back to comparison' }).click();
  await page.getByRole('button', { name: 'Back to puzzle' }).click();
  await expect(page.locator('.move-counter')).toHaveText('0 moves');
  await expect(page.getByRole('button', { name: /^Target vehicle X,/ })).toHaveAccessibleName(/row C, column 1/);

  await page.getByRole('spinbutton', { name: /Seed/ }).fill('246346');
  await page.getByRole('button', { name: 'Random 6×6' }).click();
  await expect(page.locator('.preset-caption')).toContainText('Seed 246346');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('shows and independently inspects real BFS and A* branches at the same search step', async ({ page }, testInfo) => {
  await openSite(page);
  await openSearch(page);
  await page.getByRole('button', { name: 'Search trees' }).click();
  const bfs = page.getByRole('region', { name: 'BFS search tree', exact: true });
  const astar = page.getByRole('region', { name: 'A* search tree', exact: true });
  const bfsPicker = bfs.getByRole('combobox', { name: 'Inspect a position' });
  const astarPicker = astar.getByRole('combobox', { name: 'Inspect a position' });
  const bfsStart = bfs.getByRole('button', { name: /^#0\b/ });
  const astarStart = astar.getByRole('button', { name: /^#0\b/ });
  const next = page.getByRole('button', { name: 'Next step' });
  await expect(bfsPicker).toHaveValue('0');
  await expect(astarPicker).toHaveValue('0');

  await next.click();
  await expect(page.getByTestId('bfs-expanded')).toHaveText('1');
  await expect(page.getByTestId('astar-expanded')).toHaveText('1');
  await expect(bfs.getByRole('button', { name: /^#1\b.*A left 1\b/ })).toBeVisible();
  await expect(astar.getByRole('button', { name: /^#4\b.*F down 2\b/ })).toBeVisible();

  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  await expect(page.getByRole('img', { name: /^A\* current search state/ })).toBeVisible();
  await expect(page.getByTestId('astar-expanded')).toHaveText('1');
  await page.getByRole('button', { name: 'Search trees' }).click();
  await next.click();
  await expect(bfsPicker).toHaveValue('1');
  await expect(astarPicker).toHaveValue('4');
  await expect(bfs.getByRole('list', { name: 'Moves from the starting position' })).toContainText('A left 1');
  await expect(astar.getByRole('list', { name: 'Moves from the starting position' })).toContainText('F down 2');
  await expect(bfs.getByRole('img', { name: /^BFS position #1\b/ })).toHaveAccessibleName(/Vehicle A, horizontal, 2 cells, row A, column 2\b/);
  await expect(astar.getByRole('img', { name: /^A\* position #4\b/ })).toHaveAccessibleName(/Vehicle F, vertical, 2 cells, row D, column 3\b/);
  await checkA11y(page);
  await page.screenshot({ path: testInfo.outputPath('search-trees.png'), fullPage: true, animations: 'disabled' });

  await bfs.getByRole('button', { name: /^#1\b.*A left 1\b/ }).focus();
  await page.keyboard.press('Tab');
  await expect(bfsPicker).toBeFocused();
  await bfsStart.click();
  await expect(bfsPicker).toHaveValue('0');
  await expect(bfs.getByRole('img', { name: /^BFS position #0\b/ })).toHaveAccessibleName(/Vehicle A, horizontal, 2 cells, row A, column 3\b/);
  await expect(astarPicker).toHaveValue('4');
  await astarPicker.selectOption('1');
  await expect(astar.getByRole('img', { name: /^A\* position #1\b/ })).toHaveAccessibleName(/Vehicle A, horizontal, 2 cells, row A, column 2\b/);
  await expect(bfsPicker).toHaveValue('0');

  const bfsWidth = (await bfsStart.boundingBox())!.width;
  const astarWidth = (await astarStart.boundingBox())!.width;
  await bfs.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await bfsStart.boundingBox())?.width ?? 0).toBeGreaterThan(bfsWidth + 1);
  const zoomedWidth = (await bfsStart.boundingBox())!.width;
  expect((await astarStart.boundingBox())!.width).toBeCloseTo(astarWidth, 1);
  await bfs.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => (await bfsStart.boundingBox())?.width ?? zoomedWidth).toBeLessThan(zoomedWidth - 1);
  await astar.getByRole('button', { name: 'Overview', exact: true }).click();

  await expect(page.getByText('Search paused', { exact: true })).toBeVisible();
  await expect(page.getByTestId('bfs-expanded')).toHaveText('2');
  await expect(page.getByTestId('astar-expanded')).toHaveText('2');
  await bfs.getByRole('button', { name: 'Follow current', exact: true }).click();
  await astar.getByRole('button', { name: 'Follow current', exact: true }).click();
  await expect(bfsPicker).toHaveValue('1');
  await expect(astarPicker).toHaveValue('4');

  await page.getByRole('button', { name: 'Finish search' }).click();
  await expect(page.getByText(/Both found a 4-move solution/)).toBeVisible();
  await expect(bfs.getByText('Path to the goal')).toBeVisible();
  await expect(astar.getByText('Path to the goal')).toBeVisible();
  await expect(bfs.getByText(/Showing the first 48 of/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replay BFS solution' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Replay A* solution' })).toBeEnabled();
});

test('expands one search without resetting playback or the hidden lane', async ({ page }, testInfo) => {
  await openSite(page);
  await openSearch(page);
  await page.getByRole('button', { name: 'Search trees' }).click();
  const bfs = page.getByRole('article', { name: 'Breadth-first search', exact: true });
  const astar = page.getByRole('article', { name: 'A* search', exact: true });
  const expandAstar = astar.getByRole('button', { name: 'A* search Expand', exact: true });
  const showBoth = astar.getByRole('button', { name: 'A* search Show both algorithms', exact: true });
  const bfsPicker = bfs.getByRole('combobox', { name: 'Inspect a position' });
  const bfsExpanded = page.getByTestId('bfs-expanded');
  const astarExpanded = page.getByTestId('astar-expanded');
  const next = page.getByRole('button', { name: 'Next step' });

  await expect(bfs.getByRole('button', { name: 'Breadth-first search Expand', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(expandAstar).toHaveAttribute('aria-expanded', 'false');
  await next.click();
  await expect(astarExpanded).toHaveText('1');
  await next.click();
  await expect(bfsPicker).toHaveValue('1');
  await bfsPicker.selectOption('0');
  await bfs.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(bfs.getByLabel('Tree zoom')).toHaveText('125%');
  const pairedWidth = (await astar.boundingBox())!.width;
  const diagram = astar.getByRole('region', { name: 'A* diagram', exact: true });
  const pairedHeight = (await diagram.boundingBox())!.height;

  await expandAstar.press('Enter');
  await expect(showBoth).toHaveAttribute('aria-expanded', 'true');
  await expect(showBoth).toBeFocused();
  await expect(bfsExpanded).toBeAttached();
  await expect(bfsExpanded).toBeHidden();
  await expect.poll(async () => (await astar.boundingBox())?.width ?? 0).toBeGreaterThan(pairedWidth * 1.5);
  await expect.poll(async () => (await diagram.boundingBox())?.height ?? 0).toBeGreaterThan(pairedHeight);
  await expect(page.getByText('Search paused', { exact: true })).toBeVisible();
  await expect(astarExpanded).toHaveText('2');
  await page.screenshot({ path: testInfo.outputPath('expanded-search.png'), fullPage: true, animations: 'disabled' });

  await next.click();
  await expect(astarExpanded).toHaveText('3');
  await expect(bfsExpanded).toHaveText('3');
  await showBoth.press('Enter');

  await expect(expandAstar).toHaveAttribute('aria-expanded', 'false');
  await expect(expandAstar).toBeFocused();
  await expect(bfsExpanded).toBeVisible();
  await expect(bfsPicker).toHaveValue('0');
  await expect(bfs.getByLabel('Tree zoom')).toHaveText('125%');
  await expect(bfs.getByRole('img', { name: /^BFS position #0\b/ })).toBeVisible();
  await expect(astar.getByRole('combobox', { name: 'Inspect a position' })).toHaveValue('13');
  await expect.poll(async () => (await astar.boundingBox())?.width ?? 0).toBeCloseTo(pairedWidth, 0);
  await expect(page.getByText('Search paused', { exact: true })).toBeVisible();
});

test('keeps a manually panned tree steady during playback and marks omitted parents', async ({ page }) => {
  await openSite(page);
  await page.getByLabel('Puzzle library').selectOption('expert-03');
  await openSearch(page);
  await page.getByRole('button', { name: 'Search trees' }).click();
  const bfs = page.getByRole('region', { name: 'BFS search tree', exact: true });
  const viewport = bfs.getByRole('region', { name: 'BFS diagram', exact: true });
  const follow = bfs.getByRole('button', { name: 'Follow current' });
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByTestId('bfs-expanded')).toHaveText('1');
  await expect(follow).toHaveAttribute('aria-pressed', 'true');

  const pan = await viewport.evaluate((element) => {
    element.scrollLeft = element.scrollLeft > 20 ? 0 : Math.min(80, element.scrollWidth - element.clientWidth);
    return element.scrollLeft;
  });
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Step speed').selectOption('200');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByTestId('bfs-expanded').textContent())).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await viewport.evaluate((element) => element.scrollLeft)).toBe(pan);
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => viewport.evaluate((element) => {
    const current = element.querySelector('[aria-current="step"]')?.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return Boolean(current && current.left >= box.left && current.right <= box.right
      && current.top >= box.top && current.bottom <= box.bottom);
  })).toBe(true);

  await page.getByRole('button', { name: 'Finish search' }).click();
  await expect(page.getByText(/Both found a 23-move solution/)).toBeVisible();
  const astar = page.getByRole('region', { name: 'A* search tree', exact: true });
  await expect(astar.getByText('Path to the goal')).toBeVisible();
  await expect(astar.locator('.search-tree-stub').first()).toContainText(/outside sample/);
  await expect(astar.locator('svg .search-tree-edge--stub').first()).toBeAttached();
  expect(await astar.locator('.search-tree-node').count()).toBeLessThanOrEqual(64);
});

test.describe('touch and reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  test('fits a phone, supports touch moves, and switches algorithm views', async ({ page }, testInfo) => {
    await openSite(page);
    await page.screenshot({ path: testInfo.outputPath('mobile-play.png'), fullPage: true, animations: 'disabled' });
    await page.getByLabel('Puzzle library').selectOption('beginner-02');
    await page.getByRole('button', { name: /^Target vehicle X,/ }).tap();
    await page.getByRole('button', { name: 'Right 4', exact: true }).tap();
    await expect(page.getByRole('status')).toContainText('You made it out');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await page.getByLabel('Puzzle library').selectOption('beginner-01');
    await openSearch(page);
    await page.getByRole('button', { name: 'Next step' }).tap();
    await page.getByRole('group', { name: 'Visible search' }).getByRole('button', { name: 'A*', exact: true }).tap();
    await expect(page.getByTestId('astar-expanded')).toHaveText('1');
    await expect(page.getByTestId('astar-expanded')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-search.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Search trees' }).tap();
    const astarTree = page.getByRole('region', { name: 'A* search tree', exact: true });
    const bfsTree = page.getByRole('region', { name: 'BFS search tree', exact: true });
    await expect(astarTree).toBeVisible();
    await expect(bfsTree).toBeHidden();
    await page.getByRole('button', { name: 'Next step' }).tap();
    await expect(astarTree.getByRole('combobox', { name: 'Inspect a position' })).toHaveValue('4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('mobile-trees.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('group', { name: 'Visible search' }).getByRole('button', { name: 'BFS', exact: true }).tap();
    await expect(bfsTree).toBeVisible();
    await expect(astarTree).toBeHidden();
    await expect(bfsTree.getByRole('combobox', { name: 'Inspect a position' })).toHaveValue('1');
    await expect(page.getByTestId('bfs-expanded')).toHaveText('2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await page.getByRole('button', { name: 'Breadth-first search Expand', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Breadth-first search Show both algorithms', exact: true })).toBeVisible();
    const lanePicker = page.getByRole('group', { name: 'Visible search' });
    await lanePicker.getByRole('button', { name: 'A*', exact: true }).tap();
    await page.getByRole('button', { name: 'A* search Show both algorithms', exact: true }).tap();
    await expect(lanePicker.getByRole('button', { name: 'A*', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(astarTree).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    await page.getByRole('button', { name: 'Back to puzzle' }).tap();
    await page.getByRole('button', { name: 'Edit board' }).tap();
    await page.getByLabel('Rows').selectOption('10');
    await page.getByRole('button', { name: 'Add vehicle' }).tap();
    await page.screenshot({ path: testInfo.outputPath('mobile-placement.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Choose a cell' }).tap();
    const firstCell = page.locator('[data-cell][tabindex="0"]');
    await expect(firstCell).toBeFocused();
    await expect(firstCell).toBeInViewport();
  });
});

test('keeps manual play available and retries a failed Python startup', async ({ page }) => {
  await page.context().route('**/pyodide/pyodide.mjs', (route) => route.abort(), { times: 1 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Rush Hour', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Compare BFS & A*' }).click();
  await expect(page.getByRole('alert')).toContainText('The solver could not run');
  await page.getByRole('button', { name: 'Retry solver' }).click();
  await expect(page.getByRole('button', { name: 'Next step' })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish search' }).click();
  await expect(page.getByText(/Both found a 4-move solution/)).toBeVisible();
});
