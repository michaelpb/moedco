'use strict';

const Modulo = {};
Modulo.DEBUG = true;
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

const middleware = {
    prefixAllSelectors: (info, {loader}, componentMeta) => {
        // TODO: replace with AST based auto-prefixing
        const name = componentMeta.options.modComponent;
        const fullName = `${loader.namespace}-${name}`;
        //let content = info.content.replace(new RegExp(name, 'ig'), fullName);
        let content = info.content.replace(/\*\/.*?\*\//ig, ''); // strip comments
        content = content.replace(/([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/gi, selector => {
            selector = selector.trim();
            if (selector.startsWith('@') || selector.startsWith(fullName)) {
                // Skip, is @media or @keyframes, or already prefixed
                return selector;
            }
            selector = selector.replace(new RegExp(name, 'ig'), fullName);
            if (!selector.startsWith(fullName)) {
                selector = `${fullName} ${selector}`;
            }
            return selector;
        });
        console.log('this is new CSS', content);
        return {...info, content};
    },
    compileTemplate(info, opts) {
        const templateCompiler = Modulo.adapters.templating[opts.templatingEngine]();
        const compiledTemplate = templateCompiler(info.content, opts);
        return {...info, compiledTemplate};
    },
    rewriteComponentNamespace(info, {loader}) {
        return {
            ...info,
            content: info.content.replace(/(<\/?)my-/ig, '$1' + loader.namespace + '-'),
        };
    },
    selectReconciliationEngine(metaInfo, opts) {
        const reconcile = Modulo.adapters.reconciliation[opts.reconciliationEngine]();
        return {...metaInfo, reconcile};
    },
    rewriteTemplateTagsAsScriptTags(info, opts) {
        // NOTE: May need to create a simple helper library of HTML parsing,
        // for both this and componentNamespace and maybe CSS "it's easy"
        return {
            ...info,
            content: info.content.replace(/<template /ig, '<script type="modulo/template"'),
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
        console.error(...messages);
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
        style: [middleware.prefixAllSelectors],
        script: [],
        'mod-state': [],
        'mod-props': [],
        'mod-component': [middleware.selectReconciliationEngine],
        'mod-load': [],
        //'mod-load': [middleware.rewriteTemplateTagsAsScriptTags],
                        // This is where we can warn if ':="' occurs (:= should
                        // only be for symbols)
    },
    enforceProps: true, // TODO: Put as default seting on mod-props
};

class ModuloLoader extends HTMLElement {
    constructor(...args) {
        super()
        this.initialize.apply(this, args);
    }

    initialize(namespace, options, factoryData=null) {
        this.namespace = namespace;
        this.customizedSettings = options;
        this.settings = Object.assign({}, defaultSettings, options);
        this.componentFactoryData = [];
        if (factoryData) {
            for (const [name, options] of factoryData) {
                this.defineComponent(name, options);
            }
        }
    }

    serialize() {
        // Note: Will probably rewrite thsi when working on "modulo-cli build"
        const arg0 = JSON.stringify(this.namespace);
        const arg1 = JSON.stringify(this.customizedSettings);
        const arg2 = JSON.stringify(this.componentFactoryData);
        return `new ModuloLoader(${arg0}, ${arg1}, ${arg2});`;
    }

    connectedCallback() {
        this.initialize(this.getAttribute('namespace'), parseAttrs(this));
        // TODO: Check if already loaded via serialized etc
        fetch(this.getAttribute('src'))
            .then(response => response.text())
            .then(this.loadString.bind(this));
    }

    applyMiddleware(typeName, tagInfo, componentMeta = null) {
        const middlewareArr = this.settings.factoryMiddleware[typeName];
        const attrs = tagInfo.options;
        assert(middlewareArr, 'not midware:', typeName);
        const opts = {
            attrs,
            loader: this,
            reconciliationEngine: attrs.reconciliationEngine || 'none',
            templatingEngine: attrs.templatingEngine || 'Backtick',
        };
        for (const func of middlewareArr) {
            tagInfo = func(tagInfo, opts, componentMeta);
            // TODO: Add asserts to make sure tagInfo remains serializable --
            // factory middleware should be preprocessing only
            // - Later make "executable" string type (for serializing
            //   post-compile templates)
        }
        return tagInfo;
    }

    loadString(text) {
        const frag = new DocumentFragment();
        const div = document.createElement('div');
        const tagInfo = {content: text, options: parseAttrs(this)};
        const {content} = this.applyMiddleware('mod-load', tagInfo, {});
        div.innerHTML = content;
        frag.append(div);
        this.loadFromDOM(div);
    }

    loadFromDOM(domElement) {
        const elem = domElement.querySelector('mod-settings');
        Object.assign(this.settings, (elem || {}).settings);
        const tags = domElement.querySelectorAll('[mod-component]');
        for (const tag of tags) {
            this.loadFromDOMElement(tag);
        }
        // TODO: Move this to loader middleware?
        const textContent = this.componentFactoryData
            .map(([tagName, options]) =>
                options.style.map(({content}) => content).join('\n')
            ).join('\n');
        const styling = document.createElement('style');
        styling.append(textContent);
        document.head.append(styling)
        console.log('this is me', this.componentFactoryData)
    }

    _checkNode(child, searchTagName) {
        if (child.nodeType === 3 || child.nodeType === 8) {
            return false; // Text node, continue (later generate warning if not whitespace)
        }
        let name = (child.tagName || '').toLowerCase();
        const splitType = (child.getAttribute('type') || '').split('/');
        if (splitType[0] && splitType[0].lower() === 'modulo') {
            name = splitType[1];
        }
        if (!(name in {script: 1, style: 1, template: 1, 'mod-state': 1, 'mod-props': 1})) {
            console.error('Modulo - Unknown tag in component def:', name);
            return false; // Invalid node (later generate warning)
        }
        return name === searchTagName;
    }

    loadTagType(parentElem, searchTagName, componentMeta) {
        const results = [];
        for (const childNode of parentElem.content.childNodes) {
            if (!this._checkNode(childNode, searchTagName)) {
                continue;
            }
            const options = parseAttrs(childNode);
            const content = searchTagName === 'template' ? childNode.innerHTML
                                                         : childNode.textContent;
            let tagInfo = {options, content};
            tagInfo = this.applyMiddleware(searchTagName, tagInfo, componentMeta);
            results.push(tagInfo);
        }
        return results;
    }

    loadFromDOMElement(elem) {
        const attrs = parseAttrs(elem);
        let componentMeta = {content: '', options: attrs};
        componentMeta = this.applyMiddleware('mod-component', componentMeta);
        const style = this.loadTagType(elem, 'style', componentMeta);
        const template = this.loadTagType(elem, 'template', componentMeta);
        const script = this.loadTagType(elem, 'script', componentMeta);
        const state = this.loadTagType(elem, 'mod-state', componentMeta);
        const props = this.loadTagType(elem, 'mod-props', componentMeta);
        assert(style.length < 2, 'Mod: only 1 style'); // later allow for cascading
        assert(script.length < 3, 'Mod: only 1 script'); // ""
        assert(template.length < 2, 'Mod: only 1 template'); // later allow for "selection"
        assert(props.length < 2, 'Mod: only 1 props');
        assert(state.length < 2, 'Mod: only 1 state');
        const options = {template, style, script, state, props, meta: componentMeta};
        this.defineComponent(attrs.modComponent, options);
    }

    defineComponent(name, options) {
        this.componentFactoryData.push([name, options]);
        const componentFactory = new ComponentFactory(this, name, options);
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
        // NOTE: Might want to clean up so we don't have to use eval()?
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
        // ...(component.script.get('context') || {}), ????
        return {
            templateInfo: this.getSelected('template'),
            context: component.getDefaultTemplateContext(),
        }
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
        let script = baseScript;
        for (const meta of this.options.script) {
            script = this.evalConstructorScript(meta, superScript);
            superScript = script;
        }
        const factory = this;
        const componentClass = class CustomComponent extends ModuloComponent {
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
        if (length === 0) {
            return null; // Later, have "Global Parent", to make interface with
                         // multi page apps easier?
        }
        return ModuloComponent.renderStack[length - 1];
    }
    renderStackPush() {
        ModuloComponent.renderStack.push(this);
    }
    renderStackPop() {
        ModuloComponent.renderStack.pop();
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

    resolveValue(value) {
        const scriptValue = this.script.get(value);
        if (scriptValue !== undefined) {
            return scriptValue;
        }
        const context = this.getDefaultTemplateContext();
        // Allow "." notation to drill down into context
        return value.split('.').reduce((obj, key) => obj[key], context);
        //return scopedEval(this, context, 'return ' + value);
    }

    getDefaultTemplateContext() {
        const state = this.state && parseAttrs(this.state, true);
        return {state, props: this.props};
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
        this.clearEvents(); // just in case, also setup events array
        for (const el of elements) {
            for (const name of el.getAttributeNames()) {
                const value = el.getAttribute(name);
                const eventName = name.slice(0, -1);
                if (!Modulo.ON_EVENTS.has(eventName)) {
                    continue;
                }
                assert(name.endsWith(':'), 'Events must be resolved attributes');
                const listener = (ev) => {
                    // Not sure why this doesn't work:
                    //const currentValue = this.getAttribute(name);
                    //const func = this.resolveValue(currentValue);
                    const func = this.resolveValue(value);
                    assert(func, `Bad ${name}, ${value} is ${func}`);
                    const payloadAttr = `${eventName}.payload`;
                    const payload = el.hasAttribute(payloadAttr) ?
                        el.getAttribute(payloadAttr) : el.value;
                    func.call(this, ev, payload);
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
        this.rerender();
        this.script.get('initialized').call(this, this);
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
            console.log('this is value', value);
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

    alter(key, callback) {
        setTimeout(() => this.set(key, callback(this.get(key))), 0);
    }

    reference(key) {
        const newVersion = this.get(key);
        setTimeout(() => this.set(key, newVersion), 0);
        return newVersion;
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
        //console.log('attributeMutated!'); // TODO dedupe 
        this.parentComponent.rerender();
    }
}
customElements.define('mod-state', ModuloState);

class ModuloProps extends HTMLElement {}
customElements.define('mod-props', ModuloProps);
