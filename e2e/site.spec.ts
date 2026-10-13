import { test, expect } from '@playwright/test'

// The public site, as a visitor who isn't signed in sees it.
test.use({ storageState: { cookies: [], origins: [] } })

test('the landing page edits one sentence, then shows the five fixes, Make it, the tools, the promises and the questions; the header has the pages, the theme switch and Open Retake', async ({
	page
}) => {
	await page.goto('/')
	await expect(
		page.getByRole('heading', { level: 1, name: 'Fix the take you already have.' })
	).toBeVisible()
	for (const heading of [
		'One recording, five small fixes.',
		'Say what it should become.',
		'Or take the timeline yourself.',
		'What you can count on',
		'Questions people ask first.',
		'Bring a video you have already recorded.'
	])
		await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
	// The contact form is on the contact page, not here.
	await expect(page.getByLabel('Message')).toHaveCount(0)

	// The five fixes follow the scroll: halfway through the scene, the third is the one shown.
	const story = page.getByRole('region', { name: 'How Retake fixes a recording' })
	await story.evaluate((scene: HTMLElement) =>
		window.scrollTo(
			0,
			window.scrollY +
				scene.getBoundingClientRect().top +
				(scene.offsetHeight - window.innerHeight) * 0.5
		)
	)
	// The step being shown is drawn in; the others are faded out (opacity 0).
	await expect(
		story.getByRole('heading', { level: 3, name: 'Fix one sentence. No reshoot.' })
	).toHaveCSS('opacity', '1')
	await expect(
		story.getByRole('heading', { level: 3, name: 'Lose the ums. Keep the point.' })
	).toHaveCSS('opacity', '0')

	// Make it, step by step: the request types itself as you scroll in.
	const make = page.getByRole('region', { name: 'Make it with AI, step by step' })
	await make.evaluate((scene: HTMLElement) =>
		window.scrollTo(
			0,
			window.scrollY +
				scene.getBoundingClientRect().top +
				(scene.offsetHeight - window.innerHeight) * 0.125
		)
	)
	await expect(make.getByText('Make this an Instagram reel', { exact: true })).toBeVisible()

	// The questions: each opens its answer below it, and closes it again.
	const firstQuestion = page.getByText('Will it change my video without asking?')
	const firstAnswer = page.getByText(/^No\. Every AI edit shows you a plan or a preview first/)
	await expect(firstAnswer).toBeHidden()
	await firstQuestion.click()
	await expect(firstAnswer).toBeVisible()
	await firstQuestion.click()
	await expect(firstAnswer).toBeHidden()

	// The header: the pages, the theme switch and Open Retake, nothing else.
	const header = page.getByRole('banner')
	const nav = header.getByRole('navigation', { name: 'Main' }).first()
	await expect(nav.getByRole('link')).toHaveText(['Features', 'How it works', 'Pricing', 'Contact'])
	await expect(header.getByRole('link', { name: 'Open Retake' }).first()).toBeVisible()
	await expect(header.getByRole('switch', { name: 'Light mode' }).first()).toBeVisible()
	await expect(header.getByRole('link', { name: 'Projects' })).toHaveCount(0)
	// Each opens its own page, marked as the one you're on.
	for (const [link, path, heading] of [
		['Features', /\/features$/, "Everything a good edit needs. Nothing it doesn't."],
		['How it works', /\/how-it-works$/, 'Two paths. Same happy ending.'],
		['Pricing', /\/pricing$/, 'Free, while in beta.'],
		['Contact', /\/contact$/, 'Say hello. We read everything.']
	] as const) {
		await nav.getByRole('link', { name: link }).click()
		await expect(page).toHaveURL(path, { timeout: 30_000 })
		// Each page compiles on its first visit to a cold dev server.
		await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
			timeout: 30_000
		})
		await expect(nav.getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
	}
	// The contact page: name, email, what it's about and the message.
	await expect(page.getByLabel('Name')).toBeVisible()
	await expect(page.getByLabel('Email')).toBeVisible()
	await expect(page.getByLabel("What's it about?")).toHaveValue('question')
	await expect(page.getByLabel('Message')).toBeVisible()
	// Then the questions: each opens its answer below it, and closes it again.
	const question = page.getByText('Where are my videos kept?')
	const answer = page.getByText(
		/^In your browser\. Editing, previews and export run on your computer/
	)
	await expect(answer).toBeHidden()
	await question.click()
	await expect(answer).toBeVisible()
	await question.click()
	await expect(answer).toBeHidden()

	// The footer reaches the privacy policy.
	await page
		.getByRole('navigation', { name: 'Footer' })
		.getByRole('link', { name: 'Privacy' })
		.click()
	await expect(
		page.getByRole('heading', { level: 1, name: 'Your videos, your call.' })
	).toBeVisible({ timeout: 30_000 })
	await expect(page.getByRole('heading', { level: 2, name: 'AI and other services' })).toBeVisible()
})

test('pricing says free while in beta, with the way in', async ({ page }) => {
	await page.goto('/pricing')
	await expect(page.getByRole('heading', { level: 2, name: 'Free' })).toBeVisible()
	await expect(page.getByRole('list', { name: 'Included' }).getByRole('listitem')).toHaveCount(8)
	await expect(page.getByRole('heading', { name: 'Any limits during beta?' })).toBeVisible()
	await expect(page.getByText(/\[[A-Z ]+\]/)).toHaveCount(0)
})

test('how it works switches between its two paths', async ({ page }) => {
	await page.goto('/how-it-works')
	const paths = page.getByRole('radiogroup', { name: 'Choose a path' })
	await expect(page.getByRole('heading', { level: 3, name: 'Read the plan.' })).toBeVisible()
	await paths.getByRole('radio', { name: 'Edit manually' }).click()
	await expect(page.getByRole('heading', { level: 3, name: 'Cut and arrange.' })).toBeVisible()
	await expect(page.getByRole('heading', { level: 3, name: 'Read the plan.' })).toHaveCount(0)
})

test.describe('signed in', () => {
	test.use({ storageState: 'e2e/.auth/user.json' })

	test('the app bar has only New project, Projects, the theme switch and Sign out', async ({
		page
	}) => {
		await page.goto('/projects')
		const header = page.getByRole('banner')
		const nav = header.getByRole('navigation', { name: 'Main' }).first()
		await expect(nav.getByRole('link')).toHaveText(['New project', 'Projects'])
		await expect(nav.getByRole('link', { name: 'Projects' })).toHaveAttribute(
			'aria-current',
			'page'
		)
		await expect(header.getByRole('switch', { name: 'Light mode' })).toBeVisible()
		await expect(header.getByRole('link', { name: 'How it works' })).toHaveCount(0)
		// With accounts off (no Supabase, as on CI) nobody is signed in to sign out.
		const signedIn = await header.getByRole('button', { name: 'Sign out' }).first().isVisible()
		test.skip(!signedIn, 'accounts are off here (no Supabase): nobody is signed in')
		await expect(header.getByRole('link', { name: 'Open Retake' })).toHaveCount(0)
	})

	test('dark is the default; the switch turns light on every page, and it is remembered', async ({
		page
	}) => {
		const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')
		await page.goto('/home')
		expect(await theme()).toBe('dark')
		const toggle = page.getByRole('switch', { name: 'Light mode' })
		await expect(toggle).toHaveAttribute('aria-checked', 'false')
		await toggle.click()
		expect(await theme()).toBe('light')
		await expect(toggle).toHaveAttribute('aria-checked', 'true')
		// The page really is light: the background, not just the attribute.
		const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
		expect(background).toBe('rgb(245, 244, 251)')

		await page.goto('/projects')
		expect(await theme()).toBe('light')
		await page.reload()
		expect(await theme()).toBe('light')
		await expect(page.getByRole('switch', { name: 'Light mode' })).toHaveAttribute(
			'aria-checked',
			'true'
		)
		await page.getByRole('switch', { name: 'Light mode' }).click()
		await page.goto('/home')
		expect(await theme()).toBe('dark')
	})
})

test('a contact message is checked, sent, and thanked', async ({ page }) => {
	// The form's action, answered as if saved: CI has no database. The request
	// still reaches the real server, with its input emptied (refused before
	// any write), so only the result inside Next's reply is swapped.
	await page.route(
		(url) => url.pathname.endsWith('/contact'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			const response = await route.fetch({ postData: '[{}]' })
			await route.fulfill({
				response,
				body: (await response.text()).replace(/\{"ok":false[^\n]*\}/, '{"ok":true,"data":null}')
			})
		}
	)
	await page.goto('/contact')
	await page.getByLabel('Name').fill('Sam')
	await page.getByLabel('Email').fill('not-an-email')
	await page.getByLabel("What's it about?").selectOption({ label: 'Feedback or an idea' })
	await page.getByLabel('Message').fill('Hello')
	await page.getByRole('button', { name: 'Send message' }).click()
	// The browser's own check stops a malformed email before anything is sent.
	expect(
		await page.getByLabel('Email').evaluate((input: HTMLInputElement) => input.validity.valid)
	).toBe(false)
	await page.getByLabel('Email').fill('sam@example.com')
	await page.getByRole('button', { name: 'Send message' }).click()
	await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible()
})

test('a person never sees the hidden field and sends it empty; a refused message says so plainly', async ({
	page
}) => {
	// The form's action, answered as the server does when a sender is over the
	// limit (or the hidden field is filled): the request still reaches the real
	// server, its input emptied, and only the result inside Next's reply is swapped.
	const sent: string[] = []
	await page.route(
		(url) => url.pathname.endsWith('/contact'),
		async (route) => {
			const request = route.request()
			if (!request.headers()['next-action']) return route.continue()
			sent.push(request.postData() ?? '')
			const response = await route.fetch({ postData: '[{}]' })
			await route.fulfill({
				response,
				body: (await response.text()).replace(
					/\{"ok":false[^\n]*\}/,
					JSON.stringify({
						ok: false,
						error: "Your message couldn't be sent right now. Please try again later.",
						status: 429
					})
				)
			})
		}
	)
	await page.goto('/contact')
	const hidden = page.locator('input[name="website"]')
	await expect(hidden).not.toBeInViewport()
	expect(await hidden.getAttribute('tabindex')).toBe('-1')
	// Not offered to a screen reader either (getByRole skips what's aria-hidden).
	await expect(page.getByRole('textbox', { name: 'Leave this empty' })).toHaveCount(0)
	await page.getByLabel('Email').fill('sam@example.com')
	await page.getByLabel('Message').fill('Hello')
	await page.getByRole('button', { name: 'Send message' }).click()
	await expect(
		page.getByText('Your message couldn’t be sent right now. Please try again later.')
	).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Message sent' })).toHaveCount(0)
	expect(JSON.parse(sent[0] ?? '[]')[0]?.website).toBe('')
})

test('the app pages ask a signed-out visitor to log in, when accounts are on', async ({ page }) => {
	await page.goto('/projects')
	const url = new URL(page.url())
	test.skip(url.pathname !== '/login', 'accounts are off here (no Supabase): nothing to sign in to')
	expect(url.searchParams.get('next')).toBe('/projects')
	await expect(page.getByRole('heading', { level: 1, name: 'Welcome back.' })).toBeVisible()
	await expect(page.getByRole('form', { name: 'Log in to Retake' })).toBeVisible()
	await page.getByRole('button', { name: 'Create an account' }).click()
	await expect(
		page.getByRole('heading', { level: 1, name: 'Start with what you have.' })
	).toBeVisible()
	await expect(page.getByRole('form', { name: 'Create your account' })).toBeVisible()
	// The password can be shown, and hidden again.
	const password = page.getByLabel('Password', { exact: true })
	await page.getByRole('button', { name: 'Show password' }).click()
	await expect(password).toHaveAttribute('type', 'text')
	await page.getByRole('button', { name: 'Hide password' }).click()
	await expect(password).toHaveAttribute('type', 'password')
})

test('on a phone, the menu closes once a page from it opens', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	const menu = page.locator('details:has(summary[aria-label="Menu"])')
	await page.locator('summary[aria-label="Menu"]').click()
	await expect(menu).toHaveAttribute('open', '')
	await menu.getByRole('link', { name: 'Features' }).click()
	await expect(
		page.getByRole('heading', {
			level: 1,
			name: "Everything a good edit needs. Nothing it doesn't."
		})
	).toBeVisible({ timeout: 30_000 })
	await expect(menu).not.toHaveAttribute('open')
	// Nothing on the page is wider than the phone.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
