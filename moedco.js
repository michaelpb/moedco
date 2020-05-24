'use strict';

const moedco = {};

if (typeof window === 'undefined') {
    window = {};
}

window.moedco = moedco;

moedco.types = {
    string: String,
    integer: Number.isInteger,
    number: Number.isFinite,
    bool: val => val === true || val === false,
    array: Array.isArray,
    object: val => val && !Array.isArray(val) && typeof val === 'object',
    func: val => val instanceof Function,
};
moedco.types.string.skipParse = true;
moedco.types.func.skipParse = true;

moedco.ON_EVENTS = new Set([
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'ondragstart', 'ondrag', 'ondragenter',
    'ondragleave', 'ondragover', 'ondrop', 'ondragend', 'onkeydown',
    'onkeypress', 'onkeyup', 'onload', 'onunload', 'onabort', 'onerror',
    'onresize', 'onscroll', 'onselect', 'onchange', 'onsubmit', 'onreset',
    'onfocus', 'onblur',
]);

moedco.ON_EVENT_SELECTOR = Array.from(moedco.ON_EVENTS).map(name => `[${name}]`).join(',');

moedco.templatingEngines = {
    Backtick: () => str => ctx => {
        const code = JSON.stringify(str).replace(/`/, "\`").slice(1, -1);
        return moedco.utils.scopedEval({}, ctx, `return ${code};`);
    },
    TinyTiny: () => {
        const TinyTiny = require("tinytiny");
        return TinyTiny;
    },
};

moedco.reconciliationEngines = {
    none: () => (component, html) => {
        if (component.options.shadow) {
            component.shadow.innerHTML = html;
        } else {
            component.innerHTML = html;
        }
    },
    'set-dom': () => {
        const setDOM = require("set-dom");
        setDOM.KEY = 'key';
        return (component, html) => {
            if (!component.mounted) {
                component.innerHTML = html;
            } else {
                setDOM(component, component.wrapHTML(html));
            }
        };
    },
    'morphdom': () => {
        const morphdom = require("morphdom");
        // TODO, a mess
        const opts = {
            getNodeKey: el =>
                ((el.attributes || {}).key || {value: undefined}).value || el.id,
            onBeforeElChildrenUpdated: (fromEl, toEl) => {
                return !toEl.tagName.includes('-');
            },
            childrenOnly: true,
        };
        return (component, html) => {
            if (!component.mounted) {
                component.innerHTML = html;
            } else {
                morphdom(component, `<div>${html}</div>`, opts);
            }
        };
    },
};

moedco.defaultOptions = {
    reconciliationEngine: 'none',
    templatingEngine: 'Backtick',
};

moedco.Options = class {
    constructor(...args) {
        Object.assign(this, moedco.defaultOptions, ...args);
        this.reconciliationEngine = moedco.reconciliationEngines[this.reconciliationEngine]();
        this.templatingEngine = moedco.templatingEngines[this.templatingEngine]();
    }
};

moedco.utils = class {
    static wrapScriptTag(contents) {
        return `
            "use strict";
            ${contents}
            return {
                get: name => {
                    try { return eval(name); }
                    catch (e) { return null; }
                },
                render: (typeof render === "undefined") ? _render : render,
                updated: (typeof updated === "undefined") ? _updated : updated,
                update: (typeof updated === "undefined") ? _update : update,
                initialized: (typeof initialized === "undefined") ? function () {} : initialized,
            };
        `;
    }

    static parseAttrs(attributes) {
        const obj = {};
        for (const attr of attributes) {
            const {name, value} = attr;
            const camelCased = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
            obj[camelCased] = value;
        }
        return obj;
    }

    // Evaluates string as code in function context, with given "this"
    // and any number of named args
    static scopedEval(thisContext, namedArgs, code) {
        const argPairs = Object.keys(namedArgs).map(key => [key, namedArgs[key]]);
        const argNames = argPairs.map(pair => pair[0]);
        const argValues = argPairs.map(pair => pair[1]);
        const func = new Function(...argNames, code);
        return func.apply(thisContext, argValues);
    }

    static rewriteEvents(component) {
        const elements = component.querySelectorAll(moedco.ON_EVENT_SELECTOR);
        const events = [];
        for (const el of elements) {
            for (const attr of el.attributes) {
                const {name, value} = attr;
                if (!moedco.ON_EVENTS.has(name)) {
                    continue;
                }
                el.removeAttribute(name);
                let listener = null;

                if (value.startsWith('props.')) {
                    console.error('props. currently disabled');
                    throw 'canoe' in 'shit creek';
                    // Attach to parent
                    const {parentComponent, props} = this;
                    const handler = props[value.slice(5)];
                    if (handler) {
                        listener = ev => handler.call(parentComponent, ev, props.key);
                    }
                } else {
                    const handler = component.script.get(value);
                    if (handler) {
                        listener = ev => handler.call(component, ev);
                    }
                }

                if (!listener) {
                    // No handler found, log an error
                    console.error(`${component.tagName}: ${value} not defined.`);
                    continue;
                }
                el.addEventListener(name.slice(2), listener);
                events.push([el, name.slice(2), listener]);
            }
        }
        return events;
    }
};

moedco._stack = [window];

// The Web Component interface
moedco.MoedcoComponentBase = class extends HTMLElement {
    constructor() {
        super();
        this.mounted = false;
        this.events = [];
        this._originalHTML = this.innerHTML;

        if (this.options.shadow) {
            this.shadow = this.attachShadow({mode: 'open'});
        }

        this.stateNameSpace = 'global';
        this.stateNameSuffix = null;
        if (this.options.state) {
            this.stateNameSuffix = this.options.state;
        }

        if (this.script.initialized) {
            this.script.initialized.call(this);
        }
    }

    get stateName() {
        if (!this.stateNameSuffix) {
            return null;
        }
        return this.stateNameSpace + '::' + this.stateNameSuffix;
    }

    get state() {
        // TODO: Allow pluggable state engine
        if (this.stateName) {
            if (!moedco.globalState[this.stateName]) {
                moedco.globalState[this.stateName] = {};
            }
            return moedco.globalState[this.stateName];
        } else {
            throw new Error('No state attached to this component');
        }
    }

    rerender() {
        // Rendering stack is controlled here
        moedco._stack.push(this);
        if (this.stateName) {
            this.props.state = this.state;
        }
        const newHTML = this.script.render.call(this, this.props);
        this.script.update.call(this, this, newHTML);
        this.script.updated.call(this, this);
        moedco._stack.pop();
    }

    _processAttr(name, value) {
        if (name === 'namespace') {
            if (!this.stateName) {
                throw new Error('Stateless component received namespace');
            }
            this.stateNameSpace = value;
        }

        if (name.startsWith('props.')) {
            name = name.slice(6); // slice out props.
            value = this.parentComponent.props[value];
        }

        if (name.endsWith(':')) {
            if (!this.parentComponent) {
                throw new Error('No parent components ' + this);
            }
            name = name.slice(0, -1); // slice out colon

            value = this.parentComponent.script.get(value);

            if (!value) {
                console.error(`${this.tagName}: ${value} not defined in ${this.parentComponent.tagName}.`);
            }
            if (value instanceof Function) {
                value = value.bind(this.parentComponent);
            }
        }

        /*
        if (name === '...props') {
            Object.assign(this.props, this.parentComponent.props);
        }
        */

        return [name, value];
    }

    clearEvents() {
        for (const [el, eventName, func] of this.events) {
            el.removeEventListener(eventName, func);
        }
        this.events = [];
    }

    buildProps() {
        this.props = {content: this._originalHTML};
        const attrs = moedco.utils.parseAttrs(this.attributes);
        for (const n of Object.keys(attrs)) {
            const [name, value] = this._processAttr(n, attrs[n]);
            this.props[name] = value;
        }

        // Do prop type checking, if applicable
        for (const key of Object.keys(this.script.types || {})) {
            const type = this.script.types[key];
            if (!(key in this.props)) {
                const reqErr = this.tagName + ' - Requires: ' + key
                if (type.isRequired) { console.error(reqErr) }
                continue;
            }

            let val = this.props[key];
            const err = `${this.tagName}: Type error ${key} received ${val}`;
            if (!type.skipParse) {
                try { val = JSON.parse(val); }
                catch(e) { console.error(err, e); }
            }
            if (!type(val)) { console.error(err); }
            this.props[key] = val;
        }
        //this.props = Object.freeze(this.props);
    }

    connectedCallback() {
        console.log('<', this.tagName, '>');
        this.parentComponent = moedco._stack[moedco._stack.length - 1];
        this.buildProps();
        this.rerender();
        console.log('</', this.tagName, '>');
        this.mounted = true;
    }

    makeAttrString() {
        return Array.from(this.attributes)
            .map(({name, value}) => `${name}=${JSON.stringify(value)}`).join(' ');
    }

    wrapHTML(inner) {
        const attrs = this.makeAttrString();
        return `<${this.tagName} ${attrs}>${inner}</${this.tagName}>`;
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
        if (!this.mounted) {
            return;
        }
        this.buildProps();
        this.rerender();
    }
}

moedco.defineComponent = (name, ...args) => {
    const componentClass = moedco.createComponent(name, ...args);
        console.log('deineieginne', name);
    customElements.define(name, componentClass);
};

moedco.globalState = {};

/*
 Create and return a component class.
 - name: should contain a '-'
 - tmpl: The template can either be a function, in which case it is a
   pure function that takes in props and outputs HTML contents and ran
   such that "this" refers to the component in the DOM, or it can be a
   HTML string that will be treated as a template.
 - js: Optional "js" attribute that can contain text resembling the
   script tag, to provide custom events and tag lifecycle.
*/
moedco.createComponent = (name, tmpl, js = '', extraOptions = {}) => {
    const {rewriteEvents, wrapScriptTag, scopedEval} = moedco.utils;

    // The "script" object represents custom JavaScript in the script
    const script = {};
    let options;
    const componentClass = class extends moedco.MoedcoComponentBase {
        get options() { return options; }
        get script() { return script; }
        static get observedAttributes() {
            const vars = compiledTemplate.ctx_vars || [];
            return Object.keys(script.types || {}).concat(vars);
        }
    };

    const context = {
        _render: props => compiledTemplate(props),
        _update: (component, newContents) => {
            component.clearEvents();
            options.reconciliationEngine(component, newContents);
        },
        _updated: component => {
            component.events = rewriteEvents(component);
        },
        componentClass,
    };

    const wrappedJS = wrapScriptTag(js);
    Object.assign(script, scopedEval(script, context, wrappedJS));
    options = new moedco.Options(extraOptions, script.options);

    // Compile a template if necessary, otherwise use 2nd argument as a pure
    // functional component
    //console.log(tmpl);
    const compiledTemplate = tmpl instanceof Function ? tmpl : options.templatingEngine(tmpl);

    return componentClass;
};

moedco.defineAll = () => {
    const templates = document.querySelectorAll('template[name*="-"]');

    for (const templateTag of templates) {
        const attrs = moedco.utils.parseAttrs(templateTag.attributes);
        const {state, name, shadow, templateEngine, reconciliationEngine} = attrs;
        const html = []; // all top level html for template
        const scripts = [];

        // Loop through appending all relevant inner content of each child
        for (const child of templateTag.content.childNodes) {
            if (child.nodeType === 3) { // TEXT_NODE
                html.push(child.textContent);
            } else if (child.tagName === 'SCRIPT') { // SCRIPT
                scripts.push(child.textContent);
            } else if (child.tagName === 'STYLE') { // STYLE
                document.head.append(child);
            } else { // STANDARD HTML NODE
                html.push(child.outerHTML);
            }
        }

        // Eventually, allow per-component template engine & reconciliation engine opts
        //const options = {shadow, templateEngine, reconciliationEngine};
        const options = {state};
        moedco.defineComponent(name, html.join(''), scripts.join(''), options);
    }
};

if (typeof module !== 'undefined') {
    module.exports.initialize = moedco.defineAll;
}
