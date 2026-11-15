import { test, expect, type Page } from '@playwright/test';

const settled = (page: Page) =>
  expect(page.locator('.workspace')).toHaveAttribute('aria-busy', 'false');
const drawn = (page: Page) => expect(page.locator('.viewer-state')).toHaveText('');
/** Rotation angle of a named node in the scene on the stage. */
const angle = (page: Page, name: string) =>
  page.evaluate(
    (node) =>
      (document.querySelector('x3d-canvas') as any).browser.currentScene.getNamedNode(node).rotation
        .angle as number,
    name,
  );

test('the dancing avatar opens on Movement and poses both figures at the chosen moment', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('app.html?example=avatar#movement');
  await settled(page);
  await expect(page.getByRole('tab')).toHaveText(['File differences', 'Movement', 'Motion paths']);
  await expect(page.locator('#tab-movement')).toHaveAttribute('aria-selected', 'true');
  await drawn(page);

  // The review in four sentences, in time order.
  const stretches = page.locator('.movement-stretch');
  await expect(stretches).toHaveCount(4);
  await expect(stretches.nth(0)).toContainText('Right arm · 1–3 s');
  await expect(stretches.nth(0)).toContainText(/Different movement, up to \d+° at r_shoulder/);
  await expect(stretches.nth(2)).toContainText('Same movement, B 0.4 s later');

  // It opens on the arm: the original raises it to the side, the revision forwards.
  await expect(page.locator('#detail')).toHaveText('t = 2 s · Right arm');
  expect(await angle(page, 'A_hanim_r_shoulder')).toBeCloseTo(1.25, 2);
  expect(await angle(page, 'B_hanim_r_shoulder')).toBeCloseTo(1.45, 2);

  // Choosing the glance moves both figures to it and names the eyes.
  await stretches.nth(1).click();
  await expect(page.locator('#detail')).toContainText('Eyes');
  await expect(page.locator('.movement-now')).toContainText('l_eyeball_joint');
  expect(await angle(page, 'B_hanim_l_eyeball_joint')).toBeGreaterThan(0.3);

  // A part opens into its joints.
  await page.getByRole('button', { name: 'Open Right arm: 2 joints' }).click();
  await expect(page.locator('.movement-grid text.joint')).toHaveText(['r_shoulder', 'r_elbow']);

  // Side by side keeps the same moment.
  await page.getByRole('button', { name: 'Side by side' }).click();
  await settled(page);
  await drawn(page);
  await expect(page.locator('#detail')).toContainText('Eyes');
  expect(errors).toEqual([]);
});

test('Joe, a full H-Anim figure, opens on Movement with its paths drawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('app.html?example=joe#movement');
  await settled(page);
  await drawn(page);
  await expect(page.locator('#timeline .movement-grid')).toBeVisible();
  await expect(page.locator('.movement-stretch').first()).toContainText('Head and neck');
  await expect(page.locator('.movement-list')).toContainText('Same movement, B 0.4 s later');
  // The stretch it opens on has both paths showing.
  const shown = await page.evaluate(() => {
    const scene = (document.querySelector('x3d-canvas') as any).browser.currentScene;
    return [0, 1].map((side) => scene.getNamedNode(`X3DIFF_TRAIL_${side}_0`).whichChoice);
  });
  expect(shown).toEqual([0, 0]);
  expect(errors).toEqual([]);
});
