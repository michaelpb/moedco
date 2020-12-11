Loader  / builder ideas:
  - mod-tools -- CLI for building
  - mod-tools pack -- VERY simple packer (later worry about webpack etc)
  - mod-tools watch -- HTTP static server with simple hot-reloading (mod-load
    will do fetches to "register" if its in DEV mode)
      - NOTE: The hot-reloading should be independent of the HTTP serving
      - So if this is served with a different server
      - Sends back CORS so it doesn't matter if its on another PORT
      - Basically a WebSocket that says "reload XYZ file"
      - Then Loader will know which ComponentFactory "owns" that file
      - Reloads file contents, then do a rerender() on all components from that factory

  - Packing turns into a single JS script tag that is inserted above mod-load
  - "If localhost" it will then do IS_DEV=true
  - So, "build step" happens as often as you want, and you launch with the
    exact same codebase as you develop with (no "build" directory with HTML)
  - "<mod-load>" -- Will ignore if a certain global IS_PRODUCTION=true

  - PACKING IDEA: If all factoryMiddleware are enforced (or have options as)
    "pre-compiled", then during compilation step actually generate the
    functions etc for templates, truly pre-compile everything for super fast
    load times. This would result in a possibly more optimized load time for
    larger builds, since it would serve pre-compiled templates (that are then
    optimized by babel etc)
      - Should probably rename "factoryMiddleware" to "factoryPreprocessors"
        or something, to imply the "serializability" constraint?

  - Eventually, utilize stuff from Polymer for polyfills:
    - https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs#nestedparens

  - Generalized idea for script tags: (DONE!)
    - More script tags = like inheritance or mix-ins
    - Each lifecycle method can be accessed with superScript.get('render')
    - There's a "Default script tag" that is included with every component
      which is the base render

  - IDEA: Maybe have a script tag that is executed for every script as a
    constructor, and the context of this one is the template rendering
    context *AND* the "resolved attribute" resolution context


State: Default state engine as follows:
  - Parent grants child state privileges
  - On parent e.g.:
      this.parentNode.childrenState['counter'] === this.state
  - State is always read-only, and you only get copies available

Syntax:
  - Write in OOP syntax here
  - Make it so that it can be 100% functional and never have to use "this"
    anywhere in the components themselves


Rules
1. NEVER modify the DOM during rewriting. It should be left as-is so the dev
   tools is more useful
2. Parent ALWAYS rewrites
3. Rewrite on he fly

Situations:
  1. Modulo component
    - Rewrite, set each as observable (OR use mutation observer hack, only used
                                       when debug mode is on)
  2. Child component
    - DO NOT rewrite, instead provide "getAttr" interface, that rewrites on the fly

Data situationss:

  1. Serializable value
    - Rewrite as serialized value like we do for mod-state, that feels right
    - OR MAYBE NOT, see (1) above
  2. Non-serializable value (?)
    - Don't rewrite, attach to dom

