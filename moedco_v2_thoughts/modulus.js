/*
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

    - Eventually, utilize stuff from Polymer:
      - https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs#nestedparens

    - Generalized idea for script tags:
      - More script tags = like inheritance or mix-ins
      - Each lifecycle method can be accessed with superScript.get('render')
      - There's a "Default script tag" that is included with every component
        which is the base render

    - IDEA: Maybe have a script tag that is executed for every script as a
      constructor, and the context of this one is the template rendering
      context *AND* the attribute resolution context
*/


/*
  State: Default state engine as follows:
    - Parent grants child state privileges
    - On parent e.g.:
        this.parentNode.childrenState['counter'] === this.state
    - State is always read-only, and you only get copies available

  Syntax:
    - Write in OOP syntax here
    - Make it so that it can be 100% functional and never have to use "this"
      anywhere in the components themselves
*/
'use strict';
const modulus = {};
modulus.DEBUG = true;
modulus._stack = [document.body];

modulus.ON_EVENTS = new Set([
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'ondragstart', 'ondrag', 'ondragenter',
    'ondragleave', 'ondragover', 'ondrop', 'ondragend', 'onkeydown',
    'onkeypress', 'onkeyup', 'onload', 'onunload', 'onabort', 'onerror',
    'onresize', 'onscroll', 'onselect', 'onchange', 'onsubmit', 'onreset',
    'onfocus', 'onblur',
]);

// TODO: Decide on ":" vs ""
modulus.ON_EVENT_SELECTOR = Array.from(modulus.ON_EVENTS).map(name => `[${name}\\:]`).join(',');
// moedco.REWRITE_CHILD_SELECTOR = []; // TODO: Select only children with : in property name


const adapters = {
    templating: {
        Backtick: () => str => {
            let html = JSON.stringify(str).replace(/`/g, "\`").slice(1, -1);
            html = html.replace(/&amp;/g, '&');
            const code = `return \`${html.trim()}\`;`
            return context => scopedEval(null, (context || {}), code);
        },
        TinyTiny: () => require('tinytiny'),
    },
    reconciliation: {
        none: () => (component, html) => {
            component.innerHTML = html;
        },
        setdom: () => {
            assert(window.setDOM, 'setDOM is not loaded at window.setDOM');
            setDOM.KEY = 'key';
            return (component, html) => {
                if (!component.isMounted) {
                    component.innerHTML = html;
                } else {
                    setDOM(component, component.wrapHTML(html));
                }
            };
        },
    },
};

const middleware = {
    cssFixNamespace: ({content}, {fullName}) => {
        return {
            // TODO: replace with AST based auto-prefixing
            content: content.replace(/\$/g, fullName),
        };
    },
    compileTemplate({content}, opts) {
        const templateCompiler = adapters.templating[opts.templatingEngine]();
        const compiledTemplate = templateCompiler(content, opts);
        return {content, compiledTemplate};
    },
    rewriteComponentNamespace(info, {loader}) {
        return {
            ...info,
            content: info.content.replace(/(<\/?)my-/ig, '$1' + loader.namespace + '-'),
        };
    },
    selectReconciliationEngine(metaInfo, opts) {
        const reconcile = adapters.reconciliation[opts.reconciliationEngine]();
        return {...metaInfo, reconcile};
    },
};

function parseAttrs(elem, processColons) {
    const obj = {};
    for (let {name, value} of Array.from(elem.attributes)) {
        name = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
        if (processColons && name.endsWith(':')) {
            // TODO: Refactor this with buildProps & _processAttr
            name = name.slice(0, -1); // slice out colon
            value = JSON.parse(value);
        }
        obj[name] = value;
    }
    return obj;
}

function assert(value, ...messages) {
    if (!value) {
        const message = Array.from(messages).join(' - ');
        throw new Error(`Modulus Error: "${message}"`)
    }
}

function scopedEval(thisContext, namedArgs, code) {
    const argPairs = Array.from(Object.entries(namedArgs));
    const argNames = argPairs.map(pair => pair[0]);
    const argValues = argPairs.map(pair => pair[1]);
    const func = new Function(...argNames, code);
    return func.apply(thisContext, argValues);
}

function observeAllAttributes(element) {
    // https://github.com/WICG/webcomponents/issues/565
    const observer = new MutationObserver(mutations => mutations
        .filter(({type}) => type === 'attributes')
        .map(element.attributeMutated, element))
    observer.observe(element, {attributes: true});
}

const defaultSettings = {
    factoryMiddleware: {
        template: [middleware.rewriteComponentNamespace, middleware.compileTemplate],
        style: [middleware.cssFixNamespace],
        script: [middleware.selectReconciliationEngine],
        'mod-state': [],
        'mod-props': [],
    },
    enforceProps: true,
};

class ModulusLoader extends HTMLElement {
    // constructor() { } TODO: Add optional constructor syntax for programmatic usage
    initialize(namespace, settings=null) {
        this.namespace = namespace;
        this.settings = Object.assign({}, settings || defaultSettings);
        // this.componentFactories = {};
    }

    connectedCallback() {
        const src = this.getAttribute('src');
        const namespace = this.getAttribute('namespace');
        this.initialize(namespace);
        fetch(src)
            .then(response => response.text())
            .then(this.loadString.bind(this));
    }

    applyMiddleware(typeName, tagInfo) {
        const middlewareArr = this.settings.factoryMiddleware[typeName];
        const attrs = tagInfo.options;
        assert(middlewareArr, 'not midware:', typeName);
        const opts = {
            attrs,
            loader: this,
            //name: attrs.modComponent,
            reconciliationEngine: attrs.reconciliationEngine || 'none',
            templatingEngine: attrs.templatingEngine || 'Backtick',
        };
        for (const func of middlewareArr) {
            tagInfo = func(tagInfo, opts);
        }
        return tagInfo;
    }

    loadString(text) {
        const frag = new DocumentFragment();
        const div = document.createElement('div');
        div.innerHTML = text;
        frag.append(div);
        this.loadFromDOM(div);
    }

    loadFromDOM(domElement) {
        const elem = domElement.querySelector('mod-settings');
        Object.assign(this.settings, (elem || {}).settings);
        const tags = domElement.querySelectorAll('template[mod-component]');
        for (const tag of tags) {
            if (tag.getAttribute('mod-isLoaded')) {
                console.log('already loaded:', tag);
                continue;
            }
            tag.setAttribute('mod-isLoaded', true);
            this.loadFromDOMElement(tag);
        }
    }

    _checkNode(child, searchTagName) {
        if (child.nodeType === 3) {
            return false; // Text node, continue (later generate warning if not whitespace)
        }
        const name = (child.tagName || '').toLowerCase();
        if (!(name in {script: 1, style: 1, template: 1, 'mod-state': 1, 'mod-props': 1})) {
            console.error('Modulus - Unknown tag in component def:', name);
            return false; // Invalid node (later generate warning)
        } else if (name !== searchTagName) {
            return false;
        }
        return true;
    }

    loadTagType(parentElem, searchTagName, property='textContent') {
        const results = [];
        for (const childNode of parentElem.content.childNodes) {
            if (!this._checkNode(childNode, searchTagName)) {
                continue;
            }
            const options = parseAttrs(childNode);
            const content = childNode[property];
            let tagInfo = {options, content};
            tagInfo = this.applyMiddleware(searchTagName, tagInfo);
            results.push(tagInfo);
        }
        return results;
    }

    loadFromDOMElement(elem) {
        const attrs = parseAttrs(elem);
        const style = this.loadTagType(elem, 'style');
        const template = this.loadTagType(elem, 'template', 'innerHTML');
        const script = this.loadTagType(elem, 'script');
        const state = this.loadTagType(elem, 'mod-state');
        const props = this.loadTagType(elem, 'mod-props');
        assert(style.length < 2, 'Mod: only 2 style'); // later allow for cascading
        assert(script.length < 2, 'Mod: only 2 script'); // ""
        assert(template.length < 2, 'Mod: only 2 template'); // later allow for "selection"
        const options = {template, style, script, state, props};
        this.defineComponent(attrs.modComponent, options);
    }

    defineComponent(name, options) {
        const componentFactory = new ComponentFactory(this, name, options);
        // this.componentFactories[name] = componentFactory;
        componentFactory.register();
    }
}

customElements.define('mod-load', ModulusLoader);

class ComponentFactory {
    // NOTE: The "dream" is to have an upgraded template like mod-component
    // that instantiates these component factories, but the "upgrade" support
    // seems still kinda iffy
    constructor(loader, name, options) {
        assert(name, 'Name must be given.');
        this.loader = loader;
        this.options = options;
        this.name = name;
        this.fullName = `${this.loader.namespace}-${name}`;
        this.componentClass = this.createClass();
    }

    wrapJavaScriptContext(contents) {
        // TODO, instead of doing this, have a default + look up hierarchy
        const lifecycleFunctions = [
            'initialized', // No-op hook, invoked once when loaded
            'prepare', // Called right before a render, returns template config
            'render', // Invokes the template
            'update', // Performs the update itself
            'updated', // No-op hook, invoked after render
        ];
        const lifecycleFunString = lifecycleFunctions.map(name => `
                ${name}: (typeof ${name} === "undefined") ? _${name} : ${name},
            `).join('');
        return `
            'use strict';
            ${contents}
            return {
                get: (name, defaultValue) => {
                    try { return eval(name); }
                    catch (e) { return defaultValue; }
                },
                ${lifecycleFunString}
            };
        `;
    }

    /* Prepares data before render() step of lifecycle */
    prepareDefaultRenderInfo(component) {
        const templateInfo = this.getSelected('template');
        const state = component.state && parseAttrs(component.state, true);
        const props = component.props;
        // ...(component.script.get('context') || {}), ????
        const context = {props, state};
        return {templateInfo, context};
    }

    createClass() {
        // The "script" object represents custom JavaScript in the script
        const script = {};
        const factory = this;
        const propsInfo = this.getSelected('props');
        const componentClass = class extends ModulusComponent {
            get script() { return script; }
            get factory() { return factory; }
            static get observedAttributes() {
                // TODO fix, almost correct
                //return Array.from(Object.keys(propsInfo.options));
                return [];
            }
        };
        const meta = this.getSelected('script') || {};
        const scriptContextDefaults = {
            _initialized: () => {},
            _prepare: component => factory.prepareDefaultRenderInfo(component),
            _render: (context, opts) => opts.compiledTemplate(context),
            _update: (newContents, component) => {
                component.clearEvents();
                meta.reconcile(component, newContents);
                console.log('reconciling!', component);
                component.rewriteEvents();
            },
            _updated: () => {},
            componentClass,
            factory,
            meta,
        };
        const wrappedJS = this.wrapJavaScriptContext(meta.content || '');
        const scriptValues = scopedEval(factory, scriptContextDefaults, wrappedJS);
        Object.assign(script, scriptValues);
        return componentClass;
    }

    getSelected(type) {
        return this.options[type][0];
    }

    register() {
        const tagName = this.fullName.toLowerCase();
        customElements.define(tagName, this.componentClass);
    }
}

class ModulusComponent extends HTMLElement {
    static renderStack = [document.body];
    static renderStackPeak() {
        const { length } = ModulusComponent.renderStack;
        return ModulusComponent.renderStack[length - 1];
    }
    renderStackPush() {
        ModulusComponent.renderStack.push(this);
    }
    renderStackPop() {
        ModulusComponent.renderStack.pop();
    }
    get isModulusComponent() {
        return true;
    }

    get settings() {
        return this.factory.loader.settings;
    }

    constructor() {
        super();
        this.isMounted = false;
        this._originalHTML = this.innerHTML;
    }

    saveUtilityComponents() {
        this.specialComponents = Array.from(this.querySelectorAll('mod-state'));
        this.specialComponents.forEach(elem => elem.remove);
    }

    restoreUtilityComponents() {
        this.specialComponents.forEach(elem => this.prepend(elem));
    }

    rerender() {
        // Calls all the LifeCycle functions in order
        this.renderStackPush();
        if (!this.isMounted) {
            this.createUtilityComponents();
        }
        this.saveUtilityComponents();
        const {context, templateInfo} = this.script.prepare.call(this, this);
        const newHTML = this.script.render.call(this, context, templateInfo);
        this.script.update.call(this, newHTML, this);
        this.script.updated.call(this, this);
        this.restoreUtilityComponents();
        this.renderStackPop();
    }

    makeAttrString() {
        return Array.from(this.attributes)
            .map(({name, value}) => `${name}=${JSON.stringify(value)}`).join(' ');
    }

    wrapHTML(inner) {
        const attrs = this.makeAttrString();
        return `<${this.tagName} ${attrs}>${inner}</${this.tagName}>`;
    }

    _processAttr(name, value, parentC) {
        if (name.endsWith(':')) {
            assert(parentC, `Parent required for ${name}:="${value}"`);
            name = name.slice(0, -1); // slice out colon

            // TODO: Finish merging "script" context with "renderInfo" somehow
            const scriptValue = parentC.script.get(value);
            // TODO: ERROR: parentC is pointing to TestThing when it should be
            // pointing to ParentThing
            console.log('this is scriptvalue', scriptValue, value, this, parentC);
            if (scriptValue === undefined) {
                const factory = parentC.factory;
                const renderInfo = factory.prepareDefaultRenderInfo(parentC);
                value = scopedEval(parentC, renderInfo.context, 'return ' + value);
            } else {
                value = scriptValue;
            }

            assert(value !== undefined, `${name}:="undefined" (${parentC.tagName})`);
            if (value instanceof Function) {
                value = value.bind(parentC);
            }
        }
        return [name, value];
    }

    buildProps() {
        const propsInfo = this.factory.getSelected('props');
        if (!propsInfo) {
            this.props = null;
            return;
        }
        this.props = {
            content: this._originalHTML,
            ...propsInfo.options,
        };
        for (const nameKey of Object.keys(propsInfo.options)) {
            const val = this.getAttribute(nameKey);
            const [name, value] = this._processAttr(nameKey, val, this.parentComponent);
            // if (this.settings.enforceProps) { } // TODO: add enforcement here
            this.props[name] = value;
        }
    }

    rewriteAttributes(elem, parentElem=null) {
        // DEAD CODE
        const newValues = {};
        for (const [name, value] of Object.entries(parseAttrs(elem))) {
            const [newName, newValue] = this._processAttr(name, value, parentElem);
            if (modulus.ON_EVENTS.has(newName)) {
                elem[newName] = (...args) => {
                }
            } else {
                elem.setAttribute(newName, newValue);
            }
            newValues[newName] = newValue;
        }
        return newValues;
    }

    rewriteEvents() {
        const elements = this.querySelectorAll(modulus.ON_EVENT_SELECTOR);
        console.log('elements to rewrite:', elements);
        this.clearEvents(); // just in case
        for (const el of elements) {
            for (const {name, value} of el.attributes) {
                if (name.slice(-1))
                if (!modulus.ON_EVENTS.has(name) && !modulus.ON_EVENTS.has(name.slice(0, -1))) {
                    continue;
                }
                const listener = (...args) => {
                    console.log('tis hpaening');
                    this.resolveAttr(name)(...args);
                };
                el.addEventListener(name.slice(2), listener);
                this.events.push([el, name.slice(2), listener]);
            }
        }
        console.log('this is events', this.events);
    }

    clearEvents() {
        for (const [el, eventName, func] of (this.events || [])) {
            el.removeEventListener(eventName, func);
        }
        this.events = [];
    }

    rewriteChildrenAttributes(node) {
        // DEAD CODE
        this.rewriteAttributes(node, this);
        node._isRewritten = true;
        // Now, descend down tree (non Modulus components only)
        for (const elem of node.children) {
            if (elem._isRewritten) {
                continue;
            }
            this.rewriteChildrenAttributes(elem);
        }
    }

    resolveAttr(key) {
        const oldValue = this.getAttribute(key);
        const [name, value] = this._processAttr(key, oldValue, this.parentComponent);
        return value;
    }

    createUtilityComponents() {
        const stateObjects = this.factory.options.state;
        for (const {options} of stateObjects) {
            console.log('this is options', options);
            const elem = document.createElement('mod-state');
            for (const [key, value] of Object.entries(options)) {
                elem.setAttribute(key, value);
            }
            this.appendChild(elem);
        }
    }

    connectedCallback() {
        const { length } = ModulusComponent.renderStack;
        this.parentComponent = ModulusComponent.renderStackPeak();
        if (modulus.DEBUG) { console.log('<', this.tagName, '>', this); }
        this.buildProps();
        this.script.initialized.call(this, this);
        this.rerender();
        if (modulus.DEBUG) { console.log('</', this.tagName, '>'); }
        this.isMounted = true;
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
        if (!this.isMounted) {
            return;
        }
        this.buildProps();
        this.rerender();
    }
}

class ModulusConfigure extends HTMLElement {
    static defaultSettings = {};
    connectedCallback() {
        this.settings = parseAttrs(this);
    }
    // attributeChangedCallback() {} // TODO - allow live configuration
}
customElements.define('mod-configure', ModulusConfigure);

class ModulusState extends HTMLElement {
    get(key) {
        if (this.hasAttribute(key + ':')) {
            const value = this.getAttribute(key + ':');
            return JSON.parse(value);
        } else {
            return this.getAttribute(key);
        }
    }
    set(key, value) {
        if (typeof value !== 'string') {
            value = JSON.stringify(value);
            key += ':';
        }
        this.setAttribute(key, value);
    }

    connectedCallback() {
        this.parentComponent = ModulusComponent.renderStackPeak();
        this.parentComponent.state = this; // Currently assumes 1 state
        if (!this.isMounted) {
            this.defaults = parseAttrs(this, true);
            observeAllAttributes(this);
            this.isMounted = true;
        }
    }
    attributeMutated() {
        console.log('attributeMutated!'); // TODO dedupe 
        this.parentComponent.rerender();
    }
}
customElements.define('mod-state', ModulusState);

class ModulusProps extends HTMLElement {}
customElements.define('mod-props', ModulusProps);

