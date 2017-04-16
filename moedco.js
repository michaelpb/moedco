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

moedco.ON_EVENTS = new Set([
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'ondragstart', 'ondrag', 'ondragenter',
    'ondragleave', 'ondragover', 'ondrop', 'ondragend', 'onkeydown',
    'onkeypress', 'onkeyup', 'onload', 'onunload', 'onabort', 'onerror',
    'onresize', 'onscroll', 'onselect', 'onchange', 'onsubmit', 'onreset',
    'onfocus', 'onblur',
]);

moedco.ON_EVENT_SELECTOR = Array.from(moedco.ON_EVENTS).map(name => `[${name}]`).join(',');
moedco.JSON_REGEX = /^\s*[\{\[].*^[\}\]]\s*$/;

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
                attrs: (typeof attrs === "undefined") ? _attrs : attrs,
            };
        `;
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
        for (const el of elements) {
            for (const attr of el.attributes) {
                const {name, value} = attr;
                if (!moedco.ON_EVENTS.has(name)) {
                    continue;
                }

                const handler = component.script.get(value);
                if (!handler) {
                    // No handler found, log an error
                    console.error(`${component.tagName}: ${value} not defined.`);
                    continue;
                }
                el.removeAttribute(name);
                el.addEventListener(name.substr(2), ev => handler.call(component, ev));
            }
        }
    }

    static vDomUpdate(element, newHTML) {
        // TODO finish this so we can vDOM if virtual-dom and
        // html-to-vdom is supported
    }
};

moedco._stack = [window];

// The Web Component interface
moedco.MoedcoComponentBase = class extends HTMLElement {
    constructor() {
        super();
        this.mounted = false;
        this._originalHTML = this.innerHTML;
    }

    wrappedEvent(name, ev) {
        this.script.get(name).call(this, ev);
    }

    rerender() {
        // Rendering stack is controlled here
        moedco._stack.push(this);
        const newHTML = this.script.render.call(this, this.props);
        this.script.update.call(this, this, newHTML);
        this.script.updated.call(this, this);
        moedco._stack.pop();
    }

    _processAttr(attr) {
        let {name, value} = attr;
        if (name.startsWith('props.')) {
            name = name.substr(6); // slice out props.
            value = this.parentComponent.props[value];
        }

        if (name.endsWith(':')) {
            if (!this.parentComponent) {
                throw new Error('No parent components ' + this);
            }
            name = name.substr(0, name.length - 1); // slice out props.

            if (value.startsWith('this.')) {
                value = this.parentComponent[value.substr(5)];
            } else {
                value = this.parentComponent.script.get(value);
            }

            if (!value) {
                console.error(`${component.tagName}: ${value} not defined in ${this.parentComponent.tagName}.`);
            }
            if (value instanceof Function) {
                value = value.bind(this.parentComponent);
            }
        }
        if (name === '...props') {
            Object.assign(this.props, this.parentComponent.props);
        }
        return {name, value};
    }

    buildProps() {
        this.props = {content: this._originalHTML};
        for (const attr of this.attributes) {
            let {name, value} = this._processAttr(attr);
            this.props[name] = value;
            console.log('this is the props', this.props);
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
            const err = this.tagName + ' - Type error: ' + key;
            if (!type.skipParse) {
                try { val = JSON.parse(val); }
                catch(e) { console.error(err); }
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

    disconnectedCallback() {
        // this.script.cleanup();
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
    customElements.define(name, componentClass);
};

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
moedco.createComponent = (name, tmpl, js = '') => {
    const {rewriteEvents, wrapScriptTag, scopedEval} = moedco.utils;

    // Compile a template if necessary, otherwise use 2nd argument as a
    // pure functional component
    const compiledTemplate = tmpl instanceof Function ? tmpl : TinyTiny(tmpl);

    // The "script" object represents custom JavaScript in the script
    const script = {};

    const componentClass = class extends moedco.MoedcoComponentBase {
        get script() {
            return script;
        }
        static get observedAttributes() {
            return script.attrs;
        }
    };

    const context = {
        _render: props => compiledTemplate(props),
        _update: (component, newContents) => {
            component.innerHTML = newContents;
        },
        _updated: component => rewriteEvents(component),
        _attrs: Array.from(compiledTemplate.ctx_vars || []),
        componentClass,
    };

    const wrappedJS = wrapScriptTag(js);
    Object.assign(script, scopedEval(script, context, wrappedJS));
    return componentClass;
};

moedco.defineAll = () => {
    const templates = document.querySelectorAll('template[name*="-"]');

    for (const templateTag of templates) {
        const name = templateTag.attributes.name.value;
        const html = []; // all top level html for template
        const scripts = [];

        // Loop through appending all relevant inner content of each child
        for (const child of templateTag.content.childNodes) {
            if (child.nodeType === 3) { // TEXT_NODE
                html.push(child.textContent);
            } else if (child.tagName === 'SCRIPT') { // SCRIPT
                scripts.push(child.textContent);
            } else { // STANDARD HTML NODE
                html.push(child.outerHTML);
            }
        }
        moedco.defineComponent(name, html.join(''), scripts.join(''));
    }
};

if (typeof module !== 'undefined') {
    module.exports.initialize = moedco.defineAll;
}
