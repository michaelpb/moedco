Todo notes: 2020-12-10

What works:
- Most things seem to work
- morphdom

What's left:
- Bugs:
    - Functions are getting bound incorrectly. Need to refactor & think props,
      "resolved attributes", etc. Reproduce
- Generalize "ComponentPart", and defining new types ones of these
    - script, template, mod-state, mod-props, etc
    - Make style collapse
    - Allow loading from files for ComponentParts using src
    - Refactor factoryMiddleware and logic around these
- Write some very simple CSS or HTML lexers
- Tooling
- Hot reloading
- Refactor, clean up, obvs

