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
const moedco = {};
moedco.DEBUG = true;

const adapters = {
    templating: {
        Backtick: () => str => ctx => {
            const code = JSON.stringify(str).replace(/`/, "\`").slice(1, -1);
            return moedco.utils.scopedEval({}, ctx, `return ${code};`);
        },
        TinyTiny: () => {
            const TinyTiny = require("tinytiny");
            return TinyTiny;
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
        // TODO: Somehow make this work, content is a string but we probably
        // want to change these to accept and return an object that is
        // accumulated e.g. the {content, options} object
        const templateCompiler = adapters.templating[opts.templatingEngine];
        return {
            content,
            compiledTemplate: templateCompiler(content),
        };
    },
};

function parseAttrs(elem) {
    const obj = {};
    for (const {name, value} of elem.attributes) {
        const camelCased = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
        obj[camelCased] = value;
    }
    console.log('result:', obj);
    return obj;
}

function assert(value, ...messages) {
    if (!value) {
        const message = Array.from(messages).join(' - ');
        throw new Error(`Moedco Configuration Error: "${message}"`)
    }
}

const defaultLoaderOptions = {
    middleware: {
        template: [],
        style: [middleware.cssFixNamespace],
        script: [],
    },
};

class MoedcoLoader extends HTMLElement {
    // constructor() { } TODO: Add optional constructor syntax, used when built
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
            loader: this,
            name: attrs.moedcoComponent,
            attrs,
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
        const tags = domElement.querySelectorAll('template[moedco-component]');
        for (const tag of tags) {
            if (tag.getAttribute('moedco-isLoaded')) {
                console.log('already loaded:', tag);
                continue;
            }
            tag.setAttribute('moedco-isLoaded', true);
            this.loadFromDOMElement(tag);
        }
    }

    _genWarnings(child) {
        if (child.nodeType === 3) {
            // Text node, continue (later generate warning if not whitespace)
        } else if (!(child.tagName in {SCRIPT:1, STYLE:1, TEMPLATE: 1})) {
            // Text node, continue (later generate warning)
        }
    }

    loadTagType(parentElem, childTagName, property='textContent') {
        const results = [];
        for (const childNode of parentElem.content.childNodes) {
            const {tagName} = childNode;
            this._genWarnings(childNode);
            if (!tagName || tagName !== childTagName) {
                continue;
            }
            const options = parseAttrs(childNode);
            const content = childNode[property];
            let tagInfo = {options, content};
            console.log('making taginfo', tagInfo);
            tagInfo = this.applyMiddleware(childTagName, tagInfo);
            results.push(tagInfo);
        }
        return results;
    }

    loadFromDOMElement(elem) {
        const attrs = parseAttrs(elem);
        console.log('this is elem', elem);
        const template = this.loadTagType(elem, 'template', 'innerHTML');
        const style = this.loadTagType(elem, 'style');
        const script = this.loadTagType(elem, 'script');
        assert(style.length < 2, 'Mod: only 2 style');
        assert(script.length < 2, 'Mod: only 2 script');
        assert(template.length < 2, 'Mod: only 2 template');
        console.log(style, script, template);
        const options = {template, style, script};
        this.defineComponent(attrs.moedcoComponent, options);
    }

    defineComponent(name, options) {
        const componentFactory = new ComponentFactory(this, name, options);
        // this.componentFactories[name] = componentFactory;
        componentFactory.register();
    }
}

customElements.define('moedco-load', MoedcoLoader);

class ComponentFactory {
    // NOTE: The "dream" is to have an upgraded template like moedco-component
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

    scopedEval(thisContext, namedArgs, code) {
        const argPairs = Array.from(Object.entries(namedArgs));
        const argNames = argPairs.map(pair => pair[0]);
        const argValues = argPairs.map(pair => pair[1]);
        const func = new Function(...argNames, code);
        return func.apply(thisContext, argValues);
    }

    createClass() {
        // The "script" object represents custom JavaScript in the script
        const script = {};
        const componentClass = class extends MoedcoComponent {
            get script() { return script; }
        };
        const factory = this;
        const templateInfo = factory.getSelected('template');
        const scriptContextDefaults = {
            _initialized: () => {},
            _prepare: () => templateInfo,
            _render: (props, opts) => {
                console.log('this is opts', props, opts);
                opts.compiledTemplate(props);
            },
            _updated: () => {},
            _update: (newContents) => {
                // component.clearEvents();
                factory.reconciliationEngine(component, newContents);
            },
            componentClass,
            factory,
        };
        const js = this.getSelected('script') || '';
        console.log('js', js);
        const wrappedJS = this.wrapJavaScriptContext();
        console.log('js2', wrappedJS);
        const scriptValues = this.scopedEval(factory, scriptContextDefaults, wrappedJS);
        Object.assign(script, scriptValues);
        console.log('componentClass', componentClass);
        return componentClass;
    }

    getSelected(type) {
        console.log('this is type', type);
        console.log('this is options', this.options);
        return this.options[type][0];
    }

    register() {
        const tagName = this.fullName.toLowerCase();
        customElements.define(tagName, this.componentClass);
    }
}

class MoedcoComponent extends HTMLElement {
    constructor() {
        super();
        this.isMounted = false;
        this._originalHTML = this.innerHTML;
    }

    rerender() {
        // Calls all the lifecycle functions in order
        const templateInfo = this.script.prepare.call(this);
        const newHTML = this.script.render.call(this, this.props, templateInfo);
        this.script.update.call(this, newHTML);
        this.script.updated.call(this);
    }

    connectedCallback() {
        console.log('DELISH');
        if (moedco.DEBUG) { console.log('<', this.tagName, '>', this); }
        //this.parentComponent = moedco._stack[moedco._stack.length - 1];
        //this.buildProps();
        //this.determineKey();
        this.rerender();
        if (moedco.DEBUG) { console.log('</', this.tagName, '>'); }
        this.isMounted = true;
    }
}

