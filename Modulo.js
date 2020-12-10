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
const Modulo = {};
Modulo.DEBUG = true;
Modulo._stack = [document.body];

Modulo.ON_EVENTS = new Set([
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'ondragstart', 'ondrag', 'ondragenter',
    'ondragleave', 'ondragover', 'ondrop', 'ondragend', 'onkeydown',
    'onkeypress', 'onkeyup', 'onload', 'onunload', 'onabort', 'onerror',
    'onresize', 'onscroll', 'onselect', 'onchange', 'onsubmit', 'onreset',
    'onfocus', 'onblur',
]);

// TODO: Decide on ":" vs ""
Modulo.ON_EVENT_SELECTOR = Array.from(Modulo.ON_EVENTS).map(name => `[${name}\\:]`).join(',');
// moedco.REWRITE_CHILD_SELECTOR = []; // TODO: Select only children with : in property name


const defaultLifeCycleMethods = {
    initialized: () => {},
    prepare: component => component.factory.prepareDefaultRenderInfo(component),
    render: (context, opts) => opts.compiledTemplate(context),
    update: (component, newContents) => {
        component.clearEvents();
        component.factory.options.meta.reconcile(component, newContents);
        component.rewriteEvents();
    },
    updated: () => {},
};
const baseScript = {get: key => defaultLifeCycleMethods[key]};

const adapters = {
    templating: {
        Backtick: () => str => {
            let html = JSON.stringify(str).replace(/`/g, "\`").slice(1, -1);
            html = html.replace(/&amp;/g, '&'); // probably not needed
            const code = `return \`${html.trim()}\`;`
            return context => scopedEval(null, (context || {}), code);
        },
        TinyTiny: () => {
            assert(window.TinyTiny, 'TinyTiny is not loaded at window.TinyTiny');
            return window.TinyTiny;
        },
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
    rewriteTemplateTagsAsScriptTags(info, opts) {
        // NOTE: May need to create a simple helper library of HTML parsing,
        // for both this and componentNamespace and maybe CSS "it's easy"
        return {
            ...info,
            content: info.content.replace(/<template /ig, '<script type="Modulo/template"'),
        };
    },
};

function parseAttrs(elem, processColons) {
    const obj = {};
    for (let name of elem.getAttributeNames()) {
        let value = elem.getAttribute(name);
        name = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
        if (processColons && name.endsWith(':')) {
            // TODO: Refactor this with buildProps & resolveAttr etc
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
        throw new Error(`Modulo Error: "${message}"`)
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
        script: [],
        'mod-state': [],
        'mod-props': [],
        'mod-component': [middleware.selectReconciliationEngine],
        'mod-load': [],
        //'mod-load': [middleware.rewriteTemplateTagsAsScriptTags],
        //'mod-load': [middleware.selectReconciliationEngine],
                        // This is where we can warn if ':="' occurs (:= should
                        // only be for symbols)
    },
    enforceProps: true,
};

class ModuloLoader extends HTMLElement {
    constructor(...args) {
        super()
        this.initialize.apply(this, args);
    }
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
        const tagInfo = {content: text, options: parseAttrs(this)};
        const {content} = this.applyMiddleware('mod-load', tagInfo);
        div.innerHTML = content;
        frag.append(div);
        this.loadFromDOM(div);
    }

    loadFromDOM(domElement) {
        const elem = domElement.querySelector('mod-settings');
        Object.assign(this.settings, (elem || {}).settings);
        const tags = domElement.querySelectorAll('[mod-component]');
        for (const tag of tags) {
            if (tag.getAttribute('mod-isLoaded')) {
                console.log('already loaded:', tag);
                continue;
            }
            tag.setAttribute('mod-isLoaded', true);
            const factory = this.loadFromDOMElement(tag);//, tagInfo);
        }
    }

    _checkNode(child, searchTagName) {
        if (child.nodeType === 3) {
            return false; // Text node, continue (later generate warning if not whitespace)
        }
        let name = (child.tagName || '').toLowerCase();
        const splitType = (child.getAttribute('type') || '').split('/');
        if (splitType[0] === 'Modulo') {
            name = splitType[1];
        }
        if (!(name in {script: 1, style: 1, template: 1, 'mod-state': 1, 'mod-props': 1})) {
            console.error('Modulo - Unknown tag in component def:', name);
            return false; // Invalid node (later generate warning)
        }
        return name === searchTagName;
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
        let componentMeta = {content: '', options: attrs};
        componentMeta = this.applyMiddleware('mod-component', componentMeta);
        const style = this.loadTagType(elem, 'style');
        const template = this.loadTagType(elem, 'template', 'innerHTML');
        const script = this.loadTagType(elem, 'script');
        const state = this.loadTagType(elem, 'mod-state');
        const props = this.loadTagType(elem, 'mod-props');
        assert(style.length < 2, 'Mod: only 1 style'); // later allow for cascading
        assert(script.length < 3, 'Mod: only 1 script'); // ""
        assert(template.length < 2, 'Mod: only 1 template'); // later allow for "selection"
        assert(props.length < 2, 'Mod: only 1 props');
        assert(state.length < 2, 'Mod: only 1 state');
        const options = {template, style, script, state, props, meta: componentMeta};
        this.defineComponent(attrs.modComponent, options);
    }

    defineComponent(name, options) {
        const componentFactory = new ComponentFactory(this, name, options);
        // this.componentFactories[name] = componentFactory;
        componentFactory.register();
    }
}

customElements.define('mod-load', ModuloLoader);

class ComponentFactory {
    // NOTE: The "dream" is to have an upgraded template like mod-component
    // that instantiates these component factories, but the "upgrade" support
    // seems still kinda iffy
    // Dream alternative: Use mod-load
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
        return `
            'use strict';
            const module = {exports: {}};
            ${contents}
            return {
                get: (name) => {
                    try { return eval(name); }
                    catch (e) {
                        if (superScript) {
                            return superScript.get(name);
                        } else {
                            return undefined;
                        }
                    }
                },
                ...module.exports,
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

    evalConstructorScript(meta, superScript) {
        const factory = this;
        const scriptContextDefaults = {superScript, factory, meta};
        const wrappedJS = this.wrapJavaScriptContext(meta.content || '');
        return scopedEval(factory, scriptContextDefaults, wrappedJS);
    }

    createClass() {
        // The "script" object represents custom JavaScript in the script
        let superScript = baseScript;
        let script = null;
        for (const meta of this.options.script) {
            script = this.evalConstructorScript(meta, superScript);
            superScript = script;
        }
        const factory = this;
        const componentClass = class extends ModuloComponent {
            get script() { return script; }
            get factory() { return factory; }
            static get observedAttributes() {
                // TODO fix, almost correct
                //const propsInfo = this.getSelected('props');
                //return Array.from(Object.keys(propsInfo.options));
                return [];
            }
        };
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

class ModuloComponent extends HTMLElement {
    static renderStack = [document.body];
    static renderStackPeak() {
        const { length } = ModuloComponent.renderStack;
        return ModuloComponent.renderStack[length - 1];
    }
    renderStackPush() {
        ModuloComponent.renderStack.push(this);
    }
    renderStackPop() {
        ModuloComponent.renderStack.pop();
    }
    get isModuloComponent() {
        return true;
    }

    get settings() {
        return this.factory.loader.settings;
    }

    constructor() {
        super();
        this.isMounted = false;
        this.originalHTML = this.innerHTML;
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
        const {context, templateInfo} = this.script.get('prepare').call(this, this);
        const newHTML = this.script.get('render').call(this, context, templateInfo);
        this.script.get('update').call(this, this, newHTML);
        this.script.get('updated').call(this, this);
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

    resolveValue(value) {
        const scriptValue = this.script.get(value);
        if (scriptValue !== undefined) {
            return scriptValue;
        }
        const renderInfo = this.factory.prepareDefaultRenderInfo(this);
        return scopedEval(this, renderInfo.context, 'return ' + value);
    }

    buildProps() {
        const propsInfo = this.factory.getSelected('props');
        if (!propsInfo) {
            this.props = null;
            return;
        }
        this.props = {};
        for (const propName of Object.keys(propsInfo.options)) {
            // if (this.settings.enforceProps) { } // TODO: add enforcement here
            let attrName = this.resolveAttributeName(propName);
            if (!attrName) {
                console.error('Prop', propName, 'is required for', this.tagName);
                continue;
            }
            let value = this.getAttribute(attrName);
            if (attrName.endsWith(':')) {
                // TODO: If we have DOCUMENT tier props, then resolve at window
                // instead
                attrName = attrName.slice(0, -1); // trim ':'
                value = this.parentComponent.resolveValue(value);
            }
            this.props[propName] = value;
        }
        console.log('this is props', this.props);
    }

    resolveAttributeName(name) {
        if (this.hasAttribute(name)) {
            return name;
        } else if (this.hasAttribute(name + ':')) {
            return name + ':';
        }
        return null;
    }

    rewriteEvents() {
        const elements = this.querySelectorAll(Modulo.ON_EVENT_SELECTOR);
        this.clearEvents(); // just in case
        for (const el of elements) {
            for (const name of el.getAttributeNames()) {
                const value = el.getAttribute(name);
                const eventName = name.slice(0, -1);
                if (!Modulo.ON_EVENTS.has(eventName)) {
                    continue;
                }
                assert(name.endsWith(':'), 'Events must be resolved attributes');
                const listener = (...args) => {
                    // Not sure why this doesn't work:
                    //const currentValue = this.getAttribute(name);
                    //const func = this.resolveValue(currentValue);
                    console.log('this is value', value, this);
                    const func = this.resolveValue(value);
                    assert(func, `Bad ${name}, ${value} is ${func}`);
                    func.apply(this, args);
                };
                el.addEventListener(eventName.slice(2), listener);
                this.events.push([el, eventName.slice(2), listener]);
            }
        }
    }

    clearEvents() {
        for (const [el, eventName, func] of (this.events || [])) {
            el.removeEventListener(eventName, func);
        }
        this.events = [];
    }

    createUtilityComponents() {
        const stateObjects = this.factory.options.state;
        for (const {options} of stateObjects) {
            const elem = document.createElement('mod-state');
            for (const [key, value] of Object.entries(options)) {
                elem.setAttribute(key, value);
            }
            this.appendChild(elem);
        }
    }

    connectedCallback() {
        const { length } = ModuloComponent.renderStack;
        this.parentComponent = ModuloComponent.renderStackPeak();
        if (Modulo.DEBUG) { console.log('<', this.tagName, '>', this); }
        this.buildProps();
        this.script.get('initialized').call(this, this);
        this.rerender();
        if (Modulo.DEBUG) { console.log('</', this.tagName, '>'); }
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

class ModuloConfigure extends HTMLElement {
    static defaultSettings = {};
    connectedCallback() {
        this.settings = parseAttrs(this);
    }
    // attributeChangedCallback() {} // TODO - allow live configuration
}
customElements.define('mod-configure', ModuloConfigure);

class ModuloState extends HTMLElement {
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
        this.parentComponent = ModuloComponent.renderStackPeak();
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
customElements.define('mod-state', ModuloState);

class ModuloProps extends HTMLElement {}
customElements.define('mod-props', ModuloProps);


/*
Rules
1. NEVER modify the DOM. It should be left as-is so the dev tools is more useful
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
*/
