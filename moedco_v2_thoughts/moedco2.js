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

    - PACKING IDEA: If all middleware are enforced (or have options as)
      "pre-compiled", then during compilation step actually generate the
      functions etc for templates, truly pre-compile everything for super fast
      load times. This would result in a possibly more optimized load time for
      larger builds, since it would serve pre-compiled templates (that are then
      optimized by babel etc)

    - Generalized idea for script tags:
      - More script tags = like inheritance or mix-ins
      - Each lifecycle method can be accessed with superScript.get('render')
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

const adapters = {
    templating: {
        Backtick: () => str => {
            const html = JSON.stringify(str).replace(/`/, "\`").slice(1, -1);
            const code = `return \`${html.trim()}\`;`
            return context => scopedEval(null, (context || {}), code);
        },
        TinyTiny: () => require('tinytiny'),
    },
    reconciliation: {
        none: () => (component, html) => {
            component.innerHTML = html;
        },
        'set-dom': () => {
            const setDOM = require('set-dom');
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
    cssFixNamespace: ({content}, {loader, name}) => {
        return {
            content: content.replace(/\$/g, `${loader.namespace}-${name}`),
        };
    },
    compileTemplate({content}, opts) {
        const templateCompiler = adapters.templating[opts.templatingEngine]();
        const compiledTemplate = templateCompiler(content, opts);
        return {content, compiledTemplate};
    },
    selectReconciliationEngine(metaInfo, opts) {
        const reconcile = adapters.reconciliation[opts.reconciliationEngine || 'none'];
        return {...metaInfo, reconcile};
    },
};

function parseAttrs(elem) {
    const obj = {};
    console.log('thsi is elem', elem);
    for (const {name, value} of Array.from(elem.attributes)) {
        const camelCased = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
        obj[camelCased] = value;
    }
    return obj;
}

function assert(value, ...messages) {
    if (!value) {
        const message = Array.from(messages).join(' - ');
        throw new Error(`Modulus Configuration Error: "${message}"`)
    }
}

function scopedEval(thisContext, namedArgs, code) {
    const argPairs = Array.from(Object.entries(namedArgs));
    const argNames = argPairs.map(pair => pair[0]);
    const argValues = argPairs.map(pair => pair[1]);
    const func = new Function(...argNames, code);
    return func.apply(thisContext, argValues);
}

const defaultLoaderOptions = {
    middleware: {
        template: [middleware.compileTemplate],
        style: [middleware.cssFixNamespace],
        script: [middleware.selectReconciliationEngine],
    },
};

class ModulusLoader extends HTMLElement {
    // constructor() { } TODO: Add optional constructor syntax for programmatic usage
    initialize(namespace, options=null) {
        this.namespace = namespace;
        this.options = options || defaultLoaderOptions;
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
        const middlewareArr = this.options.middleware[typeName];
        const attrs = tagInfo.options;
        assert(middlewareArr, 'not midware:', typeName);
        const opts = {
            attrs,
            loader: this,
            name: attrs.modulusComponent,
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
        if (!(name in {script: 1, style: 1, template: 1})) {
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
        assert(style.length < 2, 'Mod: only 2 style'); // later allow for cascading
        assert(script.length < 2, 'Mod: only 2 script'); // ""
        assert(template.length < 2, 'Mod: only 2 template'); // later allow for "selection"
        const options = {template, style, script};
        this.defineComponent(attrs.modulusComponent, options);
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

        // Hack, should be configurable:
        this.reconciliationEngine = (component, html) => {
            component.innerHTML = html;
        };
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
                get: name => {
                    try { return eval(name); }
                    catch (e) { return null; }
                },
                ${lifecycleFunString}
            };
        `;
    }

    /* Prepares data before render() step of lifecycle */
    prepareDefaultRenderInfo(component) {
        const templateInfo = this.getSelected('template');
        const context = {
            props: component.props,
            state: component.state,
            ...(component.script.get('context') || {}),
        };
        return {templateInfo, context};
    }

    createClass() {
        // The "script" object represents custom JavaScript in the script
        const script = {};
        const componentClass = class extends ModulusComponent {
            get script() { return script; }
        };
        const factory = this;
        const meta = this.getSelected('script') || {};
        const scriptContextDefaults = {
            _initialized: () => {},
            _prepare: component => factory.prepareDefaultRenderInfo(component),
            _render: (props, opts) => opts.compiledTemplate(props),
            _updated: () => {},
            _update: (newContents, component) => {
                // component.clearEvents();
                meta.reconcile(component, newContents);
                //component.rewriteChildAttributes();
            },
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

    constructor() {
        super();
        this.isMounted = false;
        this._originalHTML = this.innerHTML;
    }

    static renderStack = [document.body];

    rerender() {
        // Calls all the lifecycle functions in order
        ModulusComponent.renderStack.push(this);
        const {context, templateInfo} = this.script.prepare.call(this, this);
        const newHTML = this.script.render.call(this, context, templateInfo);
        this.script.update.call(this, newHTML, this);
        this.script.updated.call(this);
        ModulusComponent.renderStack.pop();
    }

    makeAttrString() {
        return Array.from(this.attributes)
            .map(({name, value}) => `${name}=${JSON.stringify(value)}`).join(' ');
    }

    wrapHTML(inner) {
        const attrs = this.makeAttrString();
        return `<${this.tagName} ${attrs}>${inner}</${this.tagName}>`;
    }

    _processAttr(name, value) {
        if (name.endsWith(':')) {
            if (!this.parentComponent) {
                throw new Error('No parent components ' + this);
            }
            name = name.slice(0, -1); // slice out colon
            value = this.parentComponent.script.get(value);
            if (!value) {
                console.error(`${this.tagName}: ${value} not defined in ${this.parentComponent.tagName}.`);
            }
        }
        return [name, value];
    }

    buildProps() {
        this.props = {content: this._originalHTML};
        const attrs = parseAttrs(this);
        for (const nameKey of Object.keys(attrs)) {
            const [name, value] = this._processAttr(nameKey, attrs[nameKey]);
            this.props[name] = value;
            this.setAttribute(name, value);
        }
    }

    connectedCallback() {
        const { length } = ModulusComponent.renderStack;
        this.parentComponent = ModulusComponent.renderStack[length - 1];
        if (modulus.DEBUG) { console.log('<', this.tagName, '>', this); }
        this.buildProps();
        this.rerender();
        if (modulus.DEBUG) { console.log('</', this.tagName, '>'); }
        this.isMounted = true;
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
        if (!this.isMounted) {
            return;
        }
        this.buildProps();
        this.rerender(true);
    }
}

