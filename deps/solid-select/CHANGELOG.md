# Changelog

## [0.15.0] - 2024-07-06

A focus on improving the ergonomics of `createOptions` to cover more use cases
whilst maintaining a good level of opinionated sensible defaults. Check out the
updated https://solid-select.com for examples of the new behaviour in action.

### Added

- Support passing a `ref` to `Select`. Useful for explicitly controlling focus
  on the control. Passed down to `input` rather than control/container as the
  input is the focusable element.

- Add ability to customise filtering logic by passing a function as `filterable`
  parameter for `createOptions`.

- Support custom formatting in `createOptions` by passing a `format` function as
  a new parameter. This can be used to control the created option labels as well
  as how the value is displayed when selected.

  As part of this, metadata is also passed to the `format` function to allow
  customising aspects that were previously hardcoded (such as the "Create"
  string when `creatable` is used or the highlighted elements from
  `filterable`).

  It is now possible to fully localise all text using this approach as well as
  mix highlighted text with other option elements (such as icons) for a richer
  filtering experience.

  A `defaultFormat` function is also exported for reuse / blending into custom
  logic.

- Add control over how text is extracted from an option's value in
  `createOptions`. Pass a custom `extractText` function to handle the
  extraction. It's result will be stored on the option under the `text`
  parameter and then used for existence comparison as well as filtering
  comparison.

- Support returning an array of options from `createable` in `createOptions` for
  cases where multiple options might be candidates for creation from a single
  input string.

### Changed

- Move to custom `createable` function in `createOptions` the decision on when
  to show a "create" option based on existing options.

  As a convenience, the `createable` function will be passed an `exists` boolean
  parameter (computed by checking the extracted text of each option against the
  current input string), but it will be up to the `createable` function what to
  do with this. In other words, the `createable` function will now _always_ be
  called on input value change, whereas previously it was only called if the
  exist check passed internally. The function is also passed the current options
  to be displayed if custom checks are desired.

  The `creatable` function can then return `undefined` (or an empty list) to
  prevent a "create" option being added.

  To avoid this being a backwards incompatible change that could cause
  unintended issues (duplicate values being created), solid-select will attempt
  to detect if the `createable` function passed has been updated to accept the
  new `exists` parameter. If it hasn't, then a warning is issued and the exist
  check internally will prevent calling the function.

- Pass `disable` function on `createOptions` the keyed value rather than full
  object when a `key` parameter is also supplied.

- Improve out-of-the-box styling so that `Select` renders nicer without
  customisation. For example, background colour of select and option list now
  defaults to white and children of select have sensible border and sizing
  defaults.

- Support extracting `fuzzySort` target ("key") via function. Useful when a
  consumer wants to sort on a nested key directly rather than use the extracted
  text of an option.

- Attempt to improve typings and make more explicit the differntiation between
  different similarly named types (e.g. the `Select` option and `createOptions`
  option). Some of these typing are not also exported for direct reuse.

- Modernise tooling for library build and packaging. Notably use pnpm as default
  packagae manager, switch from rollup to tsup for builds, drop commonjs support
  and use plain CSS rather than unnecessarily generate `style.css` through the
  now sunsetted windicss tool.

### Fixed

- Fix some styling issues such as focus outlines not being properly applied and
  border radius being clipped by container.

- Update typings to correctly represent the supported functionality of returning
  elements from a custom `format` function. Thanks to
  [LouisLuBrain](https://github.com/LouisLuBrain) for the fix.

- Avoid Apple devices stealing focus through autocorrect suggestions by setting
  `autoCorrect` to `off` on `Input` component. Thanks to
  [MaAlkhalaf](https://github.com/MaAlkhalaf) for the fix.

## [0.14.0] - 2023-04-09

A major refactor to more clearly separate out the core and the builtin
components. The builtin `Select` and accompanying component interfaces remains
unchanged, but there are backwards incompatible changes to the `createSelect`
interface.

### Changed

- **Breaking Change** Streamline the core and allow greater control in
  components. No longer pass or use element refs in the core, including not
  automatically settign up event handlers. Instead, return commonly useful
  handlers (such as `onKeyDown`) from `createSelect` for use in components.

- **Breaking Change** Expose signals directly as accessors rather than hiding
  behind property getters in return of `createSelect`. For example,
  `select.options` should now be `select.options()`. This more closely matches
  SolidJS and avoids inconsistency around not being able to set properties
  directly.

- **Breaking Change** Remove helpers (such as `open` and `close`) in favour of
  exposing setters (e.g. `setIsOpen`) consistently from `createSelect`. This
  provides a more intuitive interface rather than some aspects having helpers
  and others not.

- **Breaking Change** Refactor `Select` components to make use of a shared
  `Context` providing the created select. Avoid unnecessary prop drilling and
  make it easier to others to compose their own selects (with `useSelect`).

- **Breaking Change** Make `createAsyncOptions` throttle by default. The fetcher
  will be called every 250ms by default to prevent excessive calls to resources.
  The threshold can be configured or removed by passing a second argument - e.g.
  `createAsyncOptions(fetcher, 0)` for original behaviour.

- Hide the input caret with CSS rather than hide the entire input component to
  make some logic easier (such as focus handling).

### Fixed

- Allow repositioning the cursor on active input text. Previously, attempting to
  do this would clear the input value.

## [0.13.0] - 2022-09-12

### Changed

- **Breaking Change** Support Solid JS 1.5 as the minimum compatible version and
  update relevant typings.

## [0.12.0] - 2022-07-29

### Changed

- React to changing `initialValue` even if initially `undefined` on `Select`
  component.

### Fixed

- Fix `onFocus` prop being ignored by `Select` component. It now passes it
  through to the core and is called correctly when the select is focused. Thanks
  to [kapilpipaliya](https://github.com/kapilpipaliya) for the fix.

## [0.11.0] - 2022-05-26

### Changed

- Change `initialValue` behaviour on the `Select` component to react to signals
  in a more intuitive way. Rather than pass the raw signal in, use the resolved
  signal in a tracking context to gain reactivity for the `initialValue`. This
  is the recommended approach to passing Signals in Solid (and is also more
  similar to plain values).

  ```jsx
  <Select initialValue={initialValue}/>
  ```

  becomes

  ```jsx
  <Select initialValue={initialValue()}/>
  ```

  Thanks to [rturnq](https://github.com/rturnq) for the tip!

## [0.10.0] - 2022-05-26

### Added

- Accept `emptyPlaceholder` property on `Select` to control the message
  displayed when there are no options available. Defaults to `No options`.
  Thanks to [@raskyer](https://github.com/raskyer) for this contribution.

- The `initialValue` prop of the `Select` component can now be a Signal in order
  to support reactively re-setting the initial value of the component. This is
  useful for providing 'reset form' functionality for example.

  ```jsx
  const [initialValue, setInitialValue] = createSignal(null, { equals: false });

  <Select
    initialValue={initialValue}
    options={["apple", "banana", "pear", "pineapple", "kiwi"]}
  />

  <button onClick={() => setInitialValue(null)}>Reset</button>
  ```

## [0.9.0] - 2022-04-09

### Added

- Auto scroll focused options into view. As part of this, also set sensible
  default styles for overflow and maximum height of `solid-select-list`.

## [0.8.0] - 2022-04-02

### Added

- Provide a helper, `createAsyncOptions` for loading options asynchronously
  based on input value. Uses Solid's `createResource` under the hood.

  ```jsx
  const fetchData = async (inputValue) => { return await ... }

  const props = createAsyncOptions(fetchData);
  return <Select {...props} />;
  ```

- Support displaying a loading indicator in the options lists - useful when
  fetching options asynchronously. Pass the `loading` prop to the `Select`
  component to control whether to display the loading indicator or the list of
  options. Customise the loading message with the `loadingPlaceholder` prop.

## [0.7.1] - 2022-03-23

### Fixed

- Fix import error (`Failed to resolve import "virtual:windi.css"`) when using
  'solid' export source in another SolidJS project that does not use WindiCSS.
  Strip the relevant import line post build as it is not needed in the
  distributed package (the styles are already compiled and available via `import
  "@thisbeyond/solid-select/style.css";`).

## [0.7.0] - 2022-03-17

### Added

- Support disabling select by passing boolean value for `disabled` prop (both in
  `createSelect` or the `Select` component). When disabled no interaction is
  permitted. The component is visually styled based on the `data-disabled`
  attribute.

  ```jsx
  <Select disabled options={["one", "two", "three"]} />
  ```

### Fixed

- Ensure control is focused even when clicking on extremities of container.

## [0.6.0] - 2022-02-24

### Added

- Add builtin fuzzy search and sort algorithm. Use as default for filtering in
  `createOptions`. This replaces the previous filtering logic that could only
  match exact segments and was case sensitive. The new algorithm is case
  insensitive, can match multiple partials and prioritises start of string /
  start of word / consecutive matches. When sorting, if two matches have the
  same score then their original array index is used as the tiebreaker.

  ```js
  sorted = fuzzySort("spp", ["pineapple", "rose apple",  "star apple"])
  // [{ target: "star apple", ... }, { target: "rose apple", ... }]
  ```

  A helper to highlight matches is also included:

  ```jsx
  highlighted = fuzzyHighlight(sorted[0])
  // <><mark>s</mark>tar a<mark>pp</mark>le</>
  ```

### Changed

- Mark package as side effect free.

## [0.5.0] - 2022-02-20

### Added

- Provide a new helper, `createOptions`, to configure the `Select` component
  with (optional) filtering, dynamic creation of options from input value and
  setting disabled options based on value:

  ```jsx
  const props = createOptions(
    ["apple", "banana", "pear", "pineapple", "kiwi"],
    {
      filterable: true,
      createable: true,
      disable: (value) => value === "pear",
    }
  );
  <Select {...props} />;
  ```

  Note: All of the functionality provided by the helper can be implemented
  and/or customised manually. The helper only configures the props to pass to
  the `Select` component as a convenience.

- Support disabling individual options in the list. When an option is disabled
  it is still displayed in the option list (differentiated with some styling),
  but it cannot be picked. By default, no options are ever considered disabled.
  Pass a custom `isOptionDisabled` function to either `createSelect` or the
  `Select` component to customise how an option is determined as disabled or
  not:

  ```jsx
  <Select
    options={["apple", "pear", "kiwi"]}
    isOptionDisabled={option => option === "pear"}
  />
  ```

### Changed

- **Breaking Change** Replace `createFilterable` with more generic
  `createOptions` helper. For the most part this should just be a matter of
  updating imports and name:

  ```jsx
  const props = createFilterable(["apple", "banana", "pear"])
  <Select {...props} />
  ```

  becomes

  ```jsx
  const props = createOptions(["apple", "banana", "pear"])
  <Select {...props} />
  ```

  As part of this change, `<mark>` tags are now used for highlighting instead of
  `<b>` tags (as more appropriate). Default styling also updated to only
  underline matching text for less visual noise.

## [0.4.1] - 2022-02-12

### Fixed

- Fix remove value buttons being activated on form submission. The [W3C HTML5
  Button](https://www.w3.org/TR/2011/WD-html5-20110525/the-button-element.html)
  spec defines the default type of a button to be a submit button. This means
  that placing a multi select in a form could cause a remove value button to be
  activated when a form submission was requested by pressing the 'enter' key.
  The visible effect of this was that pressing enter in the form would remove
  multi values one by one until they were all gone. Setting the type of the
  remove button explicity to `type="button"` avoids this behaviour.

## [0.4.0] - 2022-02-08

### Added

- Support passing `id` prop to the `Select` control. The id will be set on the
  contained `input` allowing the control to be associated with a corresponding
  `label` for example.

## [0.3.0] - 2022-02-07

### Added

- Expose a `hasValue` property as part of the `createSelect` returned interface.
  The reactive property handles the differences between 'multiple' and 'single'
  value modes correctly in order to return an accurate boolean value.

### Fixed

- Fix reliance on implicit boolean conversion for control show logic. Use the
  new `hasValue` check instead to properly account for multi vs single value
  differences.

## [0.2.1] - 2022-02-05

### Fixed

- Update `rollup-plugin-solid` to 1.2.2 to address
  [Bundlephobia](bundlephobia.com) build error (caused by it tripping over the
  optinal chaining syntax `?.`). The plugin now targets a slightly older env in
  order to compile this syntax away.

## [0.2.0] - 2022-02-04

### Added

- Support picking multiple options in Select component.

  Add a `multiple` prop that, when true, customises the component to display and
  manage multiple values. Support removing values with keyboard backspace or
  removing an arbitrary value through clicking a remove button on a value.

  ```jsx
  <Select multiple options={["one", "two", "three"]} />
  ```

  As part of this, expose in the select interface whether it was configured for
  multiple values or not. This makes it easier for consumers to check the mode
  and can be useful for determining whether to expect value as an array or not.

- Support options generation via function callback. When `options` is specified
  as a function, call it on input change passing the current input value. The
  function should return the list of options to use. For example:

  ```js
  (inputValue: string) =>
    ["one", "two", "three"].filter((option) => option.startsWith(inputValue));
  ```

  To address the common case of filtering options, also provide a
  `createFilterable` helper. The helper accepts the initial list of options and
  returns the props required to set up filtering them against the input value,
  complete with highlighting the match in the string. Can be used to filter
  plain strings (or objects by passing a 'key' to the configuration):

  ```jsx
  const props = createFilterable(["one", "two", "three"])
  <Select {...props} />
  ```

- Make Select component read only by default (when a static list of options is
  passed). When in read only mode, the input is not editable. This can be
  overridden explicitly by passing the `readonly` prop to the Select component
  with the preferred value.

- Support `autofocus` attribute on Select component (to request the browser to
  auto focus the field on page load).

### Changed

- Toggle options list on click rather always open. This is more natural as
  someone might just be checking the options and then want to close the control
  with another click on the control.

### Fixed

- Fix inconsistent text rendering in the Select input.

  Ensure the input element matches the specified font for the control so that
  there is no difference between displayed value and typed text rendering.

  Also, prevent the input computing a different size due to browser default
  styles (e.g. margin, padding). Force a standard line-height for the control
  as Firefox prevents setting a smaller line-height for inputs (which can cause
  a discrepancy in how the value text is rendered vs the input text).

## [0.1.0] - 2022-01-23

Initial release featuring core create select logic, accompanying component
blocks and a composed component for convenience.

<!-- prettier-ignore -->
[unreleased]: https://github.com/thisbeyond/solid-select/compare/0.15.0...HEAD

[0.15.0]: https://github.com/thisbeyond/solid-select/compare/0.14.0...0.15.0
[0.14.0]: https://github.com/thisbeyond/solid-select/compare/0.13.0...0.14.0
[0.13.0]: https://github.com/thisbeyond/solid-select/compare/0.12.0...0.13.0
[0.12.0]: https://github.com/thisbeyond/solid-select/compare/0.11.0...0.12.0
[0.11.0]: https://github.com/thisbeyond/solid-select/compare/0.10.0...0.11.0
[0.10.0]: https://github.com/thisbeyond/solid-select/compare/0.9.0...0.10.0
[0.9.0]: https://github.com/thisbeyond/solid-select/compare/0.8.0...0.9.0
[0.8.0]: https://github.com/thisbeyond/solid-select/compare/0.7.1...0.8.0
[0.7.1]: https://github.com/thisbeyond/solid-select/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/thisbeyond/solid-select/compare/0.6.0...0.7.0
[0.6.0]: https://github.com/thisbeyond/solid-select/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/thisbeyond/solid-select/compare/0.4.1...0.5.0
[0.4.1]: https://github.com/thisbeyond/solid-select/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/thisbeyond/solid-select/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/thisbeyond/solid-select/compare/0.2.1...0.3.0
[0.2.1]: https://github.com/thisbeyond/solid-select/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/thisbeyond/solid-select/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/thisbeyond/solid-select/compare/null...0.1.0
