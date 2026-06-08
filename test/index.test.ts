import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { URLPattern as URLPatternPolyfill } from 'urlpattern-polyfill';

// The polyfill requires a string base URL, but the source passes `location` (a Location object).
// This wrapper normalizes it to location.href before delegating.
class URLPattern extends URLPatternPolyfill {
	constructor(
		input: ConstructorParameters<typeof URLPatternPolyfill>[0],
		base?: string | { href?: string; toString(): string },
	) {
		super(input, typeof base === 'string' ? base : (base?.href ?? base?.toString()));
	}
}

vi.stubGlobal('URLPattern', URLPattern);
vi.stubGlobal('location', {
	href: 'http://localhost/',
	origin: 'http://localhost',
	toString: () => 'http://localhost/',
});

// Capture the onEvent handler so tests can invoke beforeProcessNode directly.
let capturedOnEvent: ((name: string, event: any) => any) | undefined;

vi.mock('htmx.org', () => ({
	default: {
		findAll: (rootOrSelector: Element | string, selector?: string) =>
			selector
				? Array.from((rootOrSelector as Element).querySelectorAll(selector))
				: Array.from(document.querySelectorAll(rootOrSelector as string)),
		closest: (el: Element | string, selector: string) =>
			typeof el === 'string'
				? (document.querySelector(el)?.closest(selector) ?? null)
				: (el as Element).closest(selector),
		defineExtension: vi.fn(
			(_name: string, ext: { onEvent: typeof capturedOnEvent }) => {
				capturedOnEvent = ext.onEvent;
			},
		),
		process: vi.fn((el: Element) => {}),
	},
}));

function fireBeforeProcessNode(el: Element) {
	capturedOnEvent?.('htmx:beforeProcessNode', { detail: { elt: el } });
}

const { processLayout, setDefaultTarget, boostForRoute, urlEquals, testURLPattern } =
	await import('../src/index.js');

beforeEach(() => {
	document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------

describe('self outlet (el is its own outlet)', () => {
	// Case C: orphan named outlet (no parent hx-layout). processLayout treats el
	// itself as the outlet and binds matching links to it.
	it('orphan named outlet binds its own links to itself', () => {
		document.body.innerHTML = `
			<div id="outlet" hx-outlet="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		processLayout(document.getElementById('outlet')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#outlet');
		expect(a.getAttribute('hx-select')).toBe('#outlet');
	});

	// Case D explicit: one element is both layout and outlet with matching routes.
	it('layout+outlet element with matching routes is its own outlet', () => {
		document.body.innerHTML = `
			<div id="shell" hx-layout="/app/*" hx-outlet="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		processLayout(document.getElementById('shell')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#shell');
	});

	// Case D anonymous: layout with an anonymous hx-outlet on the same element.
	it('layout+anonymous-outlet element is its own outlet', () => {
		document.body.innerHTML = `
			<div id="shell" hx-layout="/app/*" hx-outlet>
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		processLayout(document.getElementById('shell')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#shell');
	});

	// Case D mismatch: one element has both attributes, but the outlet route
	// differs from the layout route. The element is not its own outlet.
	it('layout+outlet element with different routes is not its own outlet', () => {
		document.body.innerHTML = `
			<div id="shell" hx-layout="/app/*" hx-outlet="/other/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
				<div id="inner" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.getElementById('shell')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#inner');
	});

	// Self outlet without id falls back to an attribute-based single-element
	// selector (not a parent-child compound), and warns.
	it('orphan outlet without id uses single-element selector and warns', () => {
		document.body.innerHTML = `
			<div hx-outlet="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		processLayout(document.querySelector('[hx-outlet]')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('div[hx-outlet="/app/*"]');
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

// ---------------------------------------------------------------------------

describe('beforeProcessNode root discovery', () => {
	it('processes orphan named outlet (Case C) without an hx-layout ancestor', () => {
		document.body.innerHTML = `
			<div id="outlet" hx-outlet="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		fireBeforeProcessNode(document.body);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#outlet');
	});

	it('logs error for anonymous orphan outlet with no parent hx-layout', () => {
		document.body.innerHTML = `<div id="outlet" hx-outlet></div>`;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		fireBeforeProcessNode(document.body);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('does not double-process a layout+outlet element (Case D)', () => {
		document.body.innerHTML = `
			<div id="shell" hx-layout="/app/*" hx-outlet="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
			</div>`;
		fireBeforeProcessNode(document.body);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#shell');
	});

	it('does not treat an outlet nested in its layout as an orphan', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
				<div id="outlet" hx-outlet="/app/*"></div>
			</div>`;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		fireBeforeProcessNode(document.body);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-target')).toBe('#outlet');
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});

// ---------------------------------------------------------------------------

describe('processLayout', () => {
	it('logs error when hx-layout has no value', () => {
		document.body.innerHTML = `<div hx-layout></div>`;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processLayout(document.querySelector('[hx-layout]')!);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('applies hx-boost, hx-target, hx-select to matching <a>', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="link" href="http://localhost/app/dashboard"></a>
				<div id="outlet" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);
		const a = document.getElementById('link')!;
		expect(a.getAttribute('hx-boost')).toBe('true');
		expect(a.getAttribute('hx-target')).toBe('#outlet');
		expect(a.getAttribute('hx-select')).toBe('#outlet');
	});

	it('does not modify <a> whose href does not match pattern', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="link" href="http://localhost/other/page"></a>
				<div id="outlet" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);
		const a = document.getElementById('link')!;
		expect(a.hasAttribute('hx-boost')).toBe(false);
	});

	it('does not modify <a> whose href points to a different origin', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="link" href="http://example.com/app/dashboard"></a>
				<div id="outlet" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);
		const a = document.getElementById('link')!;
		expect(a.hasAttribute('hx-boost')).toBe(false);
		expect(a.hasAttribute('hx-target')).toBe(false);
	});

	it('applies attributes to matching <form>', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<form id="form" action="http://localhost/app/submit"></form>
				<div id="outlet" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);
		const form = document.getElementById('form')!;
		expect(form.getAttribute('hx-boost')).toBe('true');
		expect(form.getAttribute('hx-target')).toBe('#outlet');
	});

	it('uses #id selector when outlet has id', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a href="http://localhost/app/dashboard"></a>
				<div id="my-outlet" hx-outlet="/app/*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);
		const a = document.querySelector('a')!;
		expect(a.getAttribute('hx-target')).toBe('#my-outlet');
	});

	it('warns and uses compound selector when outlet has no id', () => {
		document.body.innerHTML = `
			<div id="layout" hx-layout="/app/*">
				<a href="http://localhost/app/dashboard"></a>
				<div hx-outlet="/app/*"></div>
			</div>`;
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		processLayout(document.querySelector('[hx-layout]')!);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it.each(['hx-get', 'hx-post', 'hx-put', 'hx-patch', 'hx-delete'])(
		'applies default target and select to matching %s elements',
		(attr) => {
			document.body.innerHTML = `
				<div hx-layout="/app/*">
					<button id="button" ${attr}="/app/action"></button>
					<div id="outlet" hx-outlet="/app/*"></div>
				</div>`;
			processLayout(document.querySelector('[hx-layout]')!);
			const button = document.getElementById('button')!;
			expect(button.getAttribute('hx-target')).toBe('#outlet');
			expect(button.getAttribute('hx-select')).toBe('#outlet');
		},
	);
});

// ---------------------------------------------------------------------------

describe('route search parameters', () => {
	it('requires matching search parameters defined in the route pattern', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*\\?tab=settings">
				<a id="match" href="http://localhost/app/page?tab=settings&extra=1"></a>
				<a id="missing" href="http://localhost/app/page"></a>
				<a id="different" href="http://localhost/app/page?tab=profile"></a>
				<div id="outlet" hx-outlet="/app/*\\?tab=settings"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);

		expect(document.getElementById('match')!.getAttribute('hx-target')).toBe(
			'#outlet',
		);
		expect(document.getElementById('missing')!.hasAttribute('hx-target')).toBe(false);
		expect(document.getElementById('different')!.hasAttribute('hx-target')).toBe(
			false,
		);
	});

	it('supports a single * wildcard for search parameter presence', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*\\?token=*">
				<a id="match" href="http://localhost/app/page?token=abc"></a>
				<a id="missing" href="http://localhost/app/page"></a>
				<div id="outlet" hx-outlet="/app/*\\?token=*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);

		expect(document.getElementById('match')!.getAttribute('hx-target')).toBe(
			'#outlet',
		);
		expect(document.getElementById('missing')!.hasAttribute('hx-target')).toBe(false);
	});

	it('does not treat prefix or suffix search parameter wildcards as patterns', () => {
		document.body.innerHTML = `
			<div hx-layout="/app/*\\?q=aaa*">
				<a id="literal" href="http://localhost/app/page?q=aaa*"></a>
				<a id="prefix" href="http://localhost/app/page?q=aaabbb"></a>
				<div id="outlet" hx-outlet="/app/*\\?q=aaa*"></div>
			</div>`;
		processLayout(document.querySelector('[hx-layout]')!);

		expect(document.getElementById('literal')!.getAttribute('hx-target')).toBe(
			'#outlet',
		);
		expect(document.getElementById('prefix')!.hasAttribute('hx-target')).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('nested layouts — inner takes priority', () => {
	// Outer layout: /app/*  →  outlet: #content
	// Inner layout: /app/settings/*  →  outlet: #settings-content
	// #tab matches BOTH patterns; #outer-link matches only the outer pattern.
	//
	// querySelectorAll returns layouts in document order: [outer, inner].
	// collectLayouts must reverse this so inner processes first, otherwise
	// setDefaultTarget's "don't overwrite" guard causes outer to permanently
	// claim #tab before the inner layout gets a chance.
	function setup() {
		document.body.innerHTML = `
			<div id="outer" hx-layout="/app/*">
				<a id="outer-link" href="http://localhost/app/dashboard"></a>
				<div id="content" hx-outlet="/app/*"></div>

				<div id="inner" hx-layout="/app/settings/*">
					<a id="tab" href="http://localhost/app/settings/profile"></a>
					<div id="settings-content" hx-outlet="/app/settings/*"></div>
				</div>
			</div>`;
	}

	it('inner layout outlet wins when beforeProcessNode fires on the container', () => {
		setup();
		// fireBeforeProcessNode simulates htmx processing the container.
		// The extension discovers [outer, inner] via querySelectorAll and must
		// process inner first — otherwise outer permanently claims #tab.
		fireBeforeProcessNode(document.body);
		const tab = document.getElementById('tab')!;
		expect(tab.getAttribute('hx-target')).toBe('#settings-content');
		expect(tab.getAttribute('hx-select')).toBe('#settings-content');
	});

	it('outer layout still claims links outside the inner layout', () => {
		setup();
		fireBeforeProcessNode(document.body);
		const link = document.getElementById('outer-link')!;
		expect(link.getAttribute('hx-target')).toBe('#content');
		expect(link.getAttribute('hx-select')).toBe('#content');
	});
});

// ---------------------------------------------------------------------------

describe('setDefaultTarget', () => {
	it('sets hx-target when not present', () => {
		const el = document.createElement('a');
		setDefaultTarget(el, '#outlet');
		expect(el.getAttribute('hx-target')).toBe('#outlet');
	});

	it('overwrites hx-target="outlet"', () => {
		const el = document.createElement('a');
		el.setAttribute('hx-target', 'outlet');
		setDefaultTarget(el, '#outlet');
		expect(el.getAttribute('hx-target')).toBe('#outlet');
	});

	it('keeps existing hx-target', () => {
		const el = document.createElement('a');
		el.setAttribute('hx-target', '#modal');
		setDefaultTarget(el, '#outlet');
		expect(el.getAttribute('hx-target')).toBe('#modal');
	});

	it('sets hx-select when not present', () => {
		const el = document.createElement('a');
		setDefaultTarget(el, '#outlet');
		expect(el.getAttribute('hx-select')).toBe('#outlet');
	});

	it('clears hx-select="*" to empty string (keeps attribute, disables querySelector)', () => {
		const el = document.createElement('a');
		el.setAttribute('hx-select', '*');
		setDefaultTarget(el, '#outlet');
		expect(el.hasAttribute('hx-select')).toBe(true);
		expect(el.getAttribute('hx-select')).toBe('');
	});

	it('keeps existing hx-select', () => {
		const el = document.createElement('a');
		el.setAttribute('hx-select', '#other');
		setDefaultTarget(el, '#outlet');
		expect(el.getAttribute('hx-select')).toBe('#other');
	});
});

// ---------------------------------------------------------------------------

describe('boostForRoute', () => {
	it('sets hx-boost="true" when not present', () => {
		const el = document.createElement('a');
		boostForRoute(el, '#outlet');
		expect(el.getAttribute('hx-boost')).toBe('true');
	});

	it('keeps existing hx-boost', () => {
		const el = document.createElement('a');
		el.setAttribute('hx-boost', 'false');
		boostForRoute(el, '#outlet');
		expect(el.getAttribute('hx-boost')).toBe('false');
	});

	it('also applies setDefaultTarget', () => {
		const el = document.createElement('a');
		boostForRoute(el, '#outlet');
		expect(el.getAttribute('hx-target')).toBe('#outlet');
		expect(el.getAttribute('hx-select')).toBe('#outlet');
	});
});

// ---------------------------------------------------------------------------

describe('urlEquals', () => {
	it('returns true for identical URLs', () => {
		expect(urlEquals('http://localhost/app', 'http://localhost/app')).toBe(true);
	});

	it('returns true regardless of search param order', () => {
		expect(
			urlEquals('http://localhost/app?b=2&a=1', 'http://localhost/app?a=1&b=2'),
		).toBe(true);
	});

	it('returns false for different URLs', () => {
		expect(urlEquals('http://localhost/app', 'http://localhost/other')).toBe(false);
	});

	it('resolves relative URLs against location', () => {
		expect(urlEquals('/app/dashboard', '/app/dashboard')).toBe(true);
		expect(urlEquals('/app/dashboard', '/app/settings')).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('testURLPattern', () => {
	describe('pathname matching', () => {
		it('matches exact pathname', () => {
			expect(testURLPattern('/app/dashboard', 'http://localhost/app/dashboard')).toBe(true);
		});

		it('does not match different pathname', () => {
			expect(testURLPattern('/app/dashboard', 'http://localhost/app/settings')).toBe(false);
		});

		it('matches with wildcard segment', () => {
			expect(testURLPattern('/app/*', 'http://localhost/app/dashboard')).toBe(true);
		});

		it('does not match when wildcard segment is missing', () => {
			expect(testURLPattern('/app/*', 'http://localhost/app')).toBe(false);
		});
	});

	describe('origin filtering', () => {
		it('does not match URL from a different hostname', () => {
			expect(testURLPattern('/app/*', 'http://example.com/app/dashboard')).toBe(false);
		});

		it('does not match URL from a different protocol', () => {
			expect(testURLPattern('/app/*', 'https://localhost/app/dashboard')).toBe(false);
		});

		it('resolves relative pattern URL against location.href', () => {
			expect(testURLPattern('/app/page', '/app/page')).toBe(true);
		});
	});

	describe('search parameter matching', () => {
		it('matches URL that has no params when pattern has none', () => {
			expect(testURLPattern('/app/*', 'http://localhost/app/page')).toBe(true);
		});

		it('matches URL with extra params when pattern has none', () => {
			expect(testURLPattern('/app/*', 'http://localhost/app/page?extra=1')).toBe(true);
		});

		it('requires param defined in pattern to be present', () => {
			expect(testURLPattern('/app/*\\?tab=settings', 'http://localhost/app/page?tab=settings')).toBe(true);
			expect(testURLPattern('/app/*\\?tab=settings', 'http://localhost/app/page')).toBe(false);
		});

		it('requires exact param value match', () => {
			expect(testURLPattern('/app/*\\?tab=settings', 'http://localhost/app/page?tab=profile')).toBe(false);
		});

		it('matches when URL has additional params beyond those in pattern', () => {
			expect(testURLPattern('/app/*\\?tab=settings', 'http://localhost/app/page?tab=settings&extra=1')).toBe(true);
		});

		it('requires all pattern params to match', () => {
			expect(testURLPattern('/app/*\\?a=1&b=2', 'http://localhost/app/page?a=1&b=2')).toBe(true);
			expect(testURLPattern('/app/*\\?a=1&b=2', 'http://localhost/app/page?a=1')).toBe(false);
		});

		it('param order in URL does not matter', () => {
			expect(testURLPattern('/app/*\\?a=1&b=2', 'http://localhost/app/page?b=2&a=1')).toBe(true);
		});
	});

	describe('wildcard search parameter value', () => {
		it('* matches any non-empty value', () => {
			expect(testURLPattern('/app/*?token=*', 'http://localhost/app/page?token=abc')).toBe(true);
		});

		it('* requires the param to be present', () => {
			expect(testURLPattern('/app/*?token=*', 'http://localhost/app/page')).toBe(false);
		});

		it('prefix wildcard like aaa* is treated as a literal value', () => {
			expect(testURLPattern('/app/*\\?q=aaa*', 'http://localhost/app/page?q=aaa*')).toBe(true);
			expect(testURLPattern('/app/*\\?q=aaa*', 'http://localhost/app/page?q=aaabbb')).toBe(false);
		});
	});

	describe('hash fragment', () => {
		it('ignores hash when matching', () => {
			expect(testURLPattern('/app/dashboard', 'http://localhost/app/dashboard#section')).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------

describe('hx-class:active', () => {
	it('adds the active class to links pointing to the current location', () => {
		location.href = 'http://localhost/app/dashboard';
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="dashboard" href="http://localhost/app/dashboard" hx-class:active="active"></a>
				<a id="settings" href="http://localhost/app/settings" hx-class:active="active" class="active"></a>
			</div>`;

		capturedOnEvent?.('htmx:afterSwap', {
			detail: { elt: document.querySelector('[hx-layout]') },
		});

		expect(document.getElementById('dashboard')!.classList.contains('active')).toBe(
			true,
		);
		expect(document.getElementById('settings')!.classList.contains('active')).toBe(
			false,
		);
	});

	it('ignores hash fragments and search parameter order when matching active links', () => {
		location.href = 'http://localhost/app/dashboard?b=2&a=1#top';
		document.body.innerHTML = `
			<div hx-layout="/app/*">
				<a id="dashboard" href="http://localhost/app/dashboard?a=1&b=2#section" hx-class:active="active"></a>
			</div>`;

		capturedOnEvent?.('htmx:afterSwap', {
			detail: { elt: document.querySelector('[hx-layout]') },
		});

		expect(document.getElementById('dashboard')!.classList.contains('active')).toBe(
			true,
		);
	});
});
