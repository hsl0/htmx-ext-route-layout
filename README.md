# htmx-ext-route-layout

Define route-based layouts for [htmx](https://htmx.org) and automatically boost matching links and forms without writing `hx-target` selectors on every element.

*No more query selectors.*

## Quickstart

Add htmx and the extension scripts:

```html
<script
  src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.10/dist/htmx.min.js" 
  crossorigin="anonymous"
></script>
<script
  src="https://cdn.jsdelivr.net/npm/htmx-ext-route-layout@0.1.0/dist/index.min.js" 
  crossorigin="anonymous"
></script>
```

Enable the extension on any ancestor element:

```html
<!-- /example/home -->
<body hx-ext="route-layout" hx-layout="/example/*">
  <h1>Example</h1>
  <main id="content" hx-outlet>
    <a href="/example/clicked">Click me</a>
  </main>
</body>

<!-- /example/clicked -->
<body hx-ext="route-layout" hx-layout="/example/*">
  <h1>Example</h1>
  <main id="content" hx-outlet>
    <p>You clicked me!</p>
    <a href="/">Exit</a>
  </main>
</body>
```

The `/example/clicked` link matches `hx-layout="/example/*"`, so it is boosted automatically and swaps only `#content`. The `/` exit link does not match the layout route, so it performs a normal page load.


## Installation

```sh
npm install htmx htmx-ext-route-layout
```

## Attributes

### `hx-layout`

Marks a container as a layout and defines its route scope with a [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) string, resolved relative to the current location.

Search parameters are matched separately from `URLPattern`. If the route pattern defines search parameters, the target URL must include matching values for those parameters. Additional parameters that are not defined in the pattern may be present or omitted. Pattern syntax is not supported for search parameter values, except for a single `*` wildcard. Prefix or suffix wildcards such as `aaa*` or `*bbb` are not supported.

Child links and forms whose `href` or `action` matches the layout route are automatically boosted with `hx-boost` and target the matching `hx-outlet` element. Set `hx-boost="false"` to disable this. Links and forms that point to a different origin are not boosted and will trigger a full page load.

Elements with `hx-get`, `hx-post`, `hx-put`, `hx-patch`, or `hx-delete` are also matched against the layout route. When they match, the extension applies the same default `hx-target` and `hx-select` values.

Every `hx-layout` should have a corresponding `hx-outlet`.

All pages that match the route **must** provide the same HTML layout, except for `hx-outlet` contents and the document `head`.

### `hx-outlet`

Marks an element as the render target for a layout. It should have an `id` for reliable matching in the response document.

- **`hx-outlet="<URLPattern>"`**: Associates the outlet with `hx-layout="<URLPattern>"`. The outlet can be anywhere in the document. If it has no ancestor `hx-layout` with the matching route, it acts as its own layout container.
- **`hx-outlet`** (no value): Associates the outlet with the nearest ancestor `hx-layout`. It must be a descendant of an element with the `hx-layout` attribute.

When `hx-layout` and `hx-outlet` are on the same element, that element is used as its own outlet if `hx-outlet` has no value or has the same route as `hx-layout`. If the routes differ, the layout uses a matching descendant outlet instead.

### `hx-class:active`

Used on `<a>` elements. When the link points to the current location, the class name specified by this attribute is added to the element. When the link no longer points to the current location, the class is removed.

URL hash fragments are ignored when comparing locations, and search parameters are compared without regard to order.

`hx-class:active` does not compute the initial active state. Mark it explicitly in the HTML. After a boosted swap, it updates links inside the affected layout while preserving active state outside it.

## Examples

### Layout with navigation outside the outlet

```html
<body hx-ext="route-layout" hx-layout="/app/*">
  <nav>
    <a href="/app/dashboard" hx-class:active="active">Dashboard</a>
    <a href="/app/settings" hx-class:active="active">Settings</a>
  </nav>

  <main id="content" hx-outlet>
    <h1>Dashboard</h1>
    <p>Welcome back.</p>
  </main>
</body>
```

### Layout as an outlet

```html
<body hx-ext="route-layout" hx-outlet="/app/*">
  <nav>
    <a href="/app/dashboard" hx-class:active="active">Dashboard</a>
    <a href="/app/settings" hx-class:active="active">Settings</a>
  </nav>

  <main>
    <div id="content">
      <h1>Dashboard</h1>
      <p>Welcome back.</p>
    </div>
  </main>
</body>
```

### Nested layouts

```html
<body hx-ext="route-layout">
  <div hx-layout="/app/*">
    <nav>
      <a href="/app/dashboard" hx-class:active="active">Dashboard</a>
      <a href="/app/settings" hx-class:active="active">Settings</a>
    </nav>

    <div
      id="app-content"
      hx-outlet="/app/*"
      hx-layout="/app/settings/*"
    >
      <a href="/app/settings/account" hx-class:active="active">Account</a>
      <a href="/app/settings/privacy" hx-class:active="active">Privacy</a>

      <div id="settings-content" hx-outlet>
        <h1>Account</h1>
        <p>Update your account settings.</p>
      </div>
    </div>
  </div>
</body>
```

For nested layouts, the innermost matching layout takes priority. In this example, settings links target `#settings-content` instead of the outer `#app-content` outlet.

## Note

`hx-layout` overrides the default values of these attributes on child elements:

| Attribute | htmx default | `hx-layout` default |
|---|---|---|
| `hx-target` | `this` | `outlet` |
| `hx-select` | entire response document | same as `hx-target` |

Elements outside `hx-layout` keep the htmx defaults.

Set `hx-target` explicitly to bypass the outlet default:

```html
<a href="/app/modal" hx-target="this">Open in modal</a>
```

Use `hx-select="*"` to request the full document instead of selecting only the corresponding outlet:

```html
<a href="/app/dashboard" hx-select="*">Full page</a>
```

Use `hx-target="outlet"` as an explicit alias for the outlet selector (same as omitting `hx-target`):

```html
<a href="/app/dashboard" hx-target="outlet">Dashboard</a>
```

## License

MIT
