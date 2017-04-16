'use strict';

// const TinyTiny = require('./tinytiny');

window.moedco = {};

const DEFAULT_SCRIPTS = [
    '"use strict";',
];

const ON_EVENTS = new Set([
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'ondragstart', 'ondrag', 'ondragenter',
    'ondragleave', 'ondragover', 'ondrop', 'ondragend', 'onkeydown',
    'onkeypress', 'onkeyup', 'onload', 'onunload', 'onabort', 'onerror',
    'onresize', 'onscroll', 'onselect', 'onchange', 'onsubmit', 'onreset',
    'onfocus', 'onblur',
]);

const ON_EVENT_SELECTOR = Array.from(ON_EVENTS).map(name => `[${name}]`).join(',');

const SCRIPTS_END = [
    `
        return {
            get: name => eval(name),
            render: (typeof render === "undefined") ? _render : render,
            updated: (typeof updated === "undefined") ? _updated : updated,
            mount: (typeof mount === "undefined") ? _mount : mount,
            attrs: (typeof attrs === "undefined") ? _attrs : attrs,
            element: (typeof element === "undefined") ? _element : element,
        };
    `,
];

// The Web Component interface
class MoedcoComponentBase extends HTMLElement {
    constructor() {
        super();
        this.moedcoComponent = window.moedco[this.componentName];
        //this.moedcoComponent.get('doconsole').call(this);
    }

    wrappedEvent(name, ev) {
        this.moedcoComponent.get(name).call(this, ev);
    }

    rerender() {
        this.innerHTML = this.moedcoComponent.render(this.getProps());
    }

    getProps() {
        const props = {}
        for (const attr of this.attributes) {
            props[attr.name] = attr.value;
        }

        for (const parentProp of this.parentProps) {
        }
        return props;
    }

    connectedCallback() {
        this.rerender();
    }

    disconnectedCallback() {
        // this.moedcoComponent.cleanup();
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
        if (oldVal !== newVal) {
            this.rerender();
        }
    }
}

// Evaluates string as code in function context, with given "this" and any
// number of named args
function _scopedEval(thisContext, namedArgs, code) {
    const argPairs = Object.keys(namedArgs).map(key => [key, namedArgs[key]]);
    const argNames = argPairs.map(pair => pair[0]);
    const argValues = argPairs.map(pair => pair[1]);
    const func = new Function(...argNames, code);
    return func.apply(thisContext, argValues);
}

window.moedcoTriggerEvent = (componentName, eventName) => {
    window.moedco[componentName].get(eventName)
}

function makeEventTrigger(componentName, eventName) {
    return `moedcoTriggerEvent("${componentName}", "${eventName}")`;
}

function initialize() {
    // Generates all the components

    // Gets all templates that have a name containing "-"
    const templates = document.querySelectorAll('template[name*="-"]');

    for (const templateTag of templates) {
        console.log('templateTag ', templateTag);
        // all top level script tags for template
        const scripts = Array.from(DEFAULT_SCRIPTS);
        const name = templateTag.attributes.name.value;
        const html = []; // all top level html for template

        // Loop through appending all relevant inner content of each child
        for (const element of templateTag.content.children) {
            if (element.tagName === 'SCRIPT') {
                scripts.push(element.textContent);
            } else {
                html.push(element.outerHTML);
            }
        }

        scripts.push(...SCRIPTS_END);
        const moedcoComponent = {};

        function fixAttrs(el) {
            for (const attr of this.attributes) {
                if (ON_EVENTS.has(attr.name)) {
                    //props[attr.name] = 'triggerEvent(' + JSON.stringify(name) + ',' attr.value;
                }
            }
        }

        const compiledTemplate = TinyTiny(html.join(''));
        const context = {
            rawContent: html.join(''),
            template: compiledTemplate,
            componentName: name,

            _render: props => compiledTemplate(props),
            _updated: element => {
                const elements = element.querySelectorAll(ON_EVENT_SELECTOR);
                for (const el of elements) {
                    fixAttrs(el);
                }
            },
            _mount: (id, initialProps) => {
                // compiledTemplate(props),
                const mountInfo = {id, component: this};
                const mountLocation = document.getElementById(id);
                const rendered = component.render.call(mountInfo, initialProps);
                mountLocation.innerHTML = rendered;
                return mountInfo;
            },
            componentClass: class extends MoedcoComponentBase {
                static get observedAttributes() {
                    return moedcoComponent.attrs;
                }
                get componentName() {
                    return name;
                }
            },
            _attrs: Array.from(compiledTemplate.ctx_vars),
            _element: {},
        };
        const fullScript = scripts.join('');

        // Execute the JavaScript code to create the new moedcoComponent
        // definition
        const result = _scopedEval(moedcoComponent, context, fullScript);
        window.moedco[name] = Object.assign(moedcoComponent, result);

        // Now we create the Web Component definition
        customElements.define(name, context.componentClass);
    }
}

// Here we mount something
function mount(id, tagname, props) {
    // NEW MOUNT (should move to separate file)
    window.log('mounting...', id, tagname, props);
    const component = window.moedco[tagname];
    return component.mount(id, props);
}

// mountedInstance is whatever mount returns
function update(mountedInstance, newProps) {
    // NEW UPDATE
    const {id, component} = mountedInstance;
    const mountLocation = document.getElementById(id);
    mountLocation.innerHTML = component.render.call(mountInfo, props);
    window.log('updating...', mountedInstance, newProps);
    return;
}

module.exports.initialize = initialize;
module.exports.mount = mount;
module.exports.update = update;

