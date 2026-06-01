import htmx from 'htmx.org';

function handleHTMXEvents<
	K extends string,
	V extends (event: E) => any,
	E extends CustomEvent<unknown>,
>(handlers: Record<K, V>): (name: K | string, event: E) => any {
	return (name, event) => {
		if (!name.startsWith('htmx:')) return;

		const unprefixedName = name.slice('htmx:'.length) as K;
		const handler = handlers[unprefixedName];

		if (typeof handler === 'function') {
			return handler(event);
		}
	};
}

export const escapeCSSString: (str: string) => string = JSON.stringify;

function getIDSelector(el: Element) {
	if (el.id) return '#' + CSS.escape(el.id);
}

function getAttrSelector(el: Element, keyAttr: string) {
	if (el.hasAttribute(keyAttr)) {
		return `[${CSS.escape(keyAttr)}=${escapeCSSString(el.getAttribute(keyAttr)!)}]`;
	}
}

export function setDefaultTarget<E extends Element>(el: E, target: string) {
	if (!el.hasAttribute('hx-target') || el.getAttribute('hx-target') === 'outlet') {
		el.setAttribute('hx-target', target);
	}

	if (!el.hasAttribute('hx-select')) {
		el.setAttribute('hx-select', target);
	} else if (el.getAttribute('hx-select') === '*') {
		el.setAttribute('hx-select', '');
	}

	if (
		!el.hasAttribute('hx-swap') &&
		el.getAttribute('hx-target') === el.getAttribute('hx-select')
	) {
		el.setAttribute('hx-swap', 'outerHTML');
	}
}

export function boostForRoute<E extends Element>(el: E, target: string) {
	if (!el.hasAttribute('hx-boost')) {
		el.setAttribute('hx-boost', 'true');
	}

	setDefaultTarget(el, target);
}

function processHXDefault<E extends Element>(
	parent: E,
	attr: string,
	route: string,
	target: string,
) {
	Array.from(htmx.findAll(parent, `[${CSS.escape(attr)}]`))
		.filter((el) => testURLPattern(route, el.getAttribute(attr)!))
		.forEach((el) => setDefaultTarget(el, target));
}

function testURLPattern(pattern: string, url: string): boolean {
	const patternURL = new URL(pattern, location.href);
	const patternObj = new URLPattern(patternURL.pathname, location.href);
	const urlObj = new URL(url, location.href);

	if (patternURL.origin !== location.origin) return false;

	for (const [key, value] of patternURL.searchParams.entries()) {
		if (value === '*') return urlObj.searchParams.has(key);
		if (urlObj.searchParams.get(key) !== value) return false;
	}

	return patternObj.test(urlObj);
}

export function processLayout(el: Element) {
	if (!el.hasAttribute('hx-layout') && !el.hasAttribute('hx-outlet')) return;

	const route = el.getAttribute('hx-layout') ?? el.getAttribute('hx-outlet');
	if (!route) {
		console.error(`hx-layout element has not specified its route`, el);
		return;
	}

	if (
		!el.hasAttribute('hx-layout') &&
		el.hasAttribute('hx-outlet') &&
		el.parentElement &&
		el.parentElement.closest(
			`[hx-layout=${escapeCSSString(el.getAttribute('hx-outlet')!)}]`,
		)
	) {
		return;
	}

	const selfIsOutlet =
		!el.hasAttribute('hx-layout') ||
		el.getAttribute('hx-outlet') === el.getAttribute('hx-layout') ||
		el.getAttribute('hx-outlet') === '';

	const outlets = selfIsOutlet
		? [el]
		: Array.from(htmx.findAll('[hx-outlet]')).filter((outlet) => {
				const outletRoute = outlet.getAttribute('hx-outlet');
				const layoutSelector = outletRoute
					? `[hx-layout=${escapeCSSString(outletRoute)}]`
					: '[hx-layout]';
				return outlet.closest(layoutSelector) === el;
			});

	if (outlets.length <= 0) {
		console.warn('hx-layout element has no children hx-outlet element', el);
		return;
	}

	const layoutSelector =
		getIDSelector(el) ||
		el.tagName.toLowerCase() + (getAttrSelector(el, 'hx-layout') || '');
	const outletSelector = outlets
		.map((outlet) => {
			if (outlet.id) return getIDSelector(outlet)!;

			console.warn(
				'hx-outlet element has no id. Outlet should have its own unique id on layout',
				outlet,
			);

			return `${layoutSelector ?? ''}${outlet === el ? '' : ' '}${(el === outlet ? '' : outlet.tagName.toLowerCase()) + getAttrSelector(outlet, 'hx-outlet')}`;
		})
		.join(', ');

	Array.from(htmx.findAll(el, 'a') as Iterable<HTMLAnchorElement>)
		.filter((a) => testURLPattern(route, a.href))
		.forEach((a) => boostForRoute(a, outletSelector));

	Array.from(htmx.findAll(el, 'form') as Iterable<HTMLFormElement>)
		.filter((form) => testURLPattern(route, form.action))
		.forEach((form) => boostForRoute(form, outletSelector));

	processHXDefault(el, 'hx-get', route, outletSelector);
	processHXDefault(el, 'hx-post', route, outletSelector);
	processHXDefault(el, 'hx-put', route, outletSelector);
	processHXDefault(el, 'hx-patch', route, outletSelector);
	processHXDefault(el, 'hx-delete', route, outletSelector);
}

function processClassActive(el: Element) {
	if (el.tagName !== 'A') return;

	const activeClassDef = el.closest(String.raw`[hx-class\:active]`);

	if (!activeClassDef) return;

	const activeClass = activeClassDef.getAttribute('hx-class:active')!;

	if (urlEquals(location.href, (el as HTMLAnchorElement).href)) {
		el.classList.add(activeClass);
	} else {
		el.classList.remove(activeClass);
	}
}

export function urlEquals(a: string, b: string) {
	const au = new URL(a, location.href);
	const bu = new URL(b, location.href);

	au.searchParams.sort();
	bu.searchParams.sort();

	au.hash = '';
	bu.hash = '';

	return au.href === bu.href;
}

function beforeProcessNode() {
	for (const el of htmx.findAll('[hx-outlet=""]:not([hx-layout]):not([hx-layout] *)')) {
		console.error('Anonymous hx-outlet has no parent hx-layout', el);
	}

	for (const el of Array.from(
		htmx.findAll('[hx-layout], [hx-outlet]:not([hx-outlet=""])'),
	).reverse()) {
		processLayout(el);
	}
}

function configRequest<E extends CustomEvent<any>>(event: E) {
	const el: HTMLElement = event.detail.elt;
	const headers: Record<string, string> = event.detail.headers;

	if (!el.hasAttribute('hx-select')) return;

	headers['HX-Select'] =
		el.getAttribute('hx-select')! + (headers['HX-Boosted'] == 'true' ? ', head' : '');
}

function afterSwap<E extends CustomEvent<any>>(event: E) {
	const el: HTMLElement = event.detail.elt;

	const root =
		el.closest(
			el.getAttribute('hx-outlet')
				? `[hx-layout=${escapeCSSString(el.getAttribute('hx-outlet')!)}]`
				: '[hx-layout]',
		) || el;

	if (!root) return;
	for (const a of htmx.findAll(
		root,
		String.raw`a[hx-class\:active], [hx-class\:active] a`,
	)) {
		processClassActive(a);
	}
}

const ext = {
	onEvent: handleHTMXEvents({
		beforeProcessNode,
		configRequest,
		afterSwap,
		'before:process': beforeProcessNode,
		'config:request': configRequest,
		'after:swap': afterSwap,
	}),
};

if ('defineExtension' in htmx && typeof htmx.defineExtension === 'function') {
	htmx.defineExtension('route-layout', ext);
} else if ('registerExtension' in htmx && typeof htmx.registerExtension === 'function') {
	htmx.registerExtension('route-layout', ext);
} else {
	throw new Error('Cannot register htmx extension route-layout');
}
