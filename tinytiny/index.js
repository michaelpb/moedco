/* * TinyTiny michaelb Copyleft 2013 - LGPL 3.0 * */
var T, th, u, TinyTiny = function (s, o) {
    T._ctx_vars = []; // new code
    var G={l:[],s:[]},t=1,i=-1,nl,f,k,n;
    for (k in T) G[k] = (o && o[k]) || T[k];
    n = s.split(RegExp('('+G.mode_tokens.join('|(').replace(/ +/g, ')(.+?)')));
    nl=n.length;
    th = function (m) { throw "TinyTiny: "+m+":"+n[i]+"@"+i; }
    while (i++<nl) n[i] !== u && G.modes[(t=!t)?n[i++]:'text'](n[i], G);
    f = new Function('x,fx,l,G', G.l.join("")+"return l.join('');");
    // tt_last_compiled = G.l.join("\n");
    var result = function (x) { return f(x, G.filters, [], G); }
    result.ctx_vars = T._ctx_vars;
    return result;
};
T = TinyTiny;

T.modes = {
    '{%': function (n, G, a, b) {
        a=G.trim(n).split(' ')[0];
        if (a===(G.s[G.s.length-1]||['!'])[0]) {
            G.l.push(G.s.pop()[1]);
        } else {
            b=(G.tags[a]||th("unknown "))(n.slice(a.length+1),G);
            G.l.push(b.start || b);
            b.end && G.s.push([b.close || ('end'+a),b.end]);
        }
    },
    '{#': function (n, G) { },
    '{{': function (n, G) { G.l.push('l.push(G.html('+G.x(n)+'));'); },
    text: function (n, G) {
        (n=G.e(n)) && G.l.push("l.push("+n+");");
    }
};
T.mode_tokens = [ '{% %}', '{{ }}', '{# #}' ];
T.filters = {};
T.tags = {};
T.html = function (k) {
    k = k === undefined ? '' : k;
    return k.safe ? k : (k+"").replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};
T.t = T.trim = function (k) { return k.replace(/^\s+|\s+$/g, ""); }
T.w = function (k) { return (k+'').replace(/[^a-zA-Z0-9$_\.]/g, ''); };
T.x = T.expression = function (k, b, c, d, e) {
    b=k.split("|");
    d=T.v(b.shift());
    while(c=T.w((e=(b.shift()||'').split(':'))[0]))
        d='fx["'+c+'"]('+d+ (e[1]?','+T.v(e[1]):'')+')';
    return d;
};
T.e = T.esc = function (k) { return JSON.stringify(k); };
T.v = T.value = function (k) {
    k = T.trim(k);
    return k.match(/^('.*'|".*")$/) ? T.e(k.substr(1, k.length-2)) :
        k.match(/^\d+$/) ? k : T.ctx_var(k);
};

T.ctx_var = function (k) {
    // New code
    T._ctx_vars.push(k);
    return 'x.' + T.w(k);
};


/* * TinyTiny michaelb Copyleft 2013 - LGPL 3.0 * */

/* ********************* */
/* Filters               */
TinyTiny.filters.upper = function (s) { return s.toUpperCase(); };
TinyTiny.filters.lower = function (s) { return s.toLowerCase(); };
TinyTiny.filters.safe = function (s) { var b=new String(s); b.safe=true; return b; };
TinyTiny.filters.add = function (s, a) { return s + a; };
TinyTiny.filters.subtract = function (s, a) { return s - a; };
TinyTiny.filters['default'] = function (s, a) { return s || a; };
TinyTiny.filters.divisibleby = function (s, a) { return ((s*1) % (a*1)) === 0; }
TinyTiny.filters.escapejs = function (s) { return JSON.stringify(s); }
TinyTiny.filters.first = function (s) { return s[0]; }
TinyTiny.filters.last = function (s) { return s[s.length-1]; }
TinyTiny.filters.join = function (s, a) { return s.join(a); }
TinyTiny.filters.length = function (s) { return s.length; }
TinyTiny.filters.pluralize = function (s, a, b) { return a.split(',')[(s===1)*1]; }

/* ********************* */
/* if / else / elif      */

TinyTiny.tags['if'] = function (n, G, a, b, c, d) {
    var ops = ['==', '>', '<', '>=', '<=', '!=', 'not in', 'is not', 'is', 'in', 'not'];
    var ops_o = {
            '!=':'X !== Y',
            '==':'X === Y',
            'is': 'X === Y',
            'is not': 'X !== Y',
            'not': '!(Y)',
            'in': 'typeof Y[X] !== "undefined" || Y.indexOf && Y.indexOf(X) != -1',
        },
        re = RegExp(' ('+ops.join('|')+') ');
    ops_o['not in'] = '!('+ops_o['in']+')';
    a = n.split(re); // injection protection
    d = a.length > 1 ? (ops_o[a[1]] || ("X "+a[1]+" Y")) : 'X';
    d = d.replace(/([XY])/g, function (k, m) { return G.x(a[m==='X'?0:2]); });
    return {
        start: 'if ('+d+'){',
        end: '}'
    };
};

TinyTiny.tags['else'] = function (n, G) {
    return '} else {';
};

TinyTiny.tags.elif = function (n, G) {
    return '} else ' + TinyTiny.tags['if'](n, G).start;
};
/* ********************* */

/* ********************* */
/* For loops             */
TinyTiny.tags['for'] = function (n, G) {
    // Keeps unique arr ids to get over JS's quirky scoping
    var arr = 'arr'+G.s.length,
        split = n.split(' in '),
        vars = split[0].split(','),
        res = 'var '+arr+'='+G.x(split[1])+';';
    res += 'for (var key in '+arr+') {';
    if (vars.length > 1) {
        res += 'x.'+G.w(vars[0])+'=key;';
        vars = vars[1];
    }
    res += 'x.'+G.w(vars)+'='+arr+'[key];';

    return {
        start: res,
        end: '}'
    }
};

TinyTiny.tags.empty = function (n, G) {
    // make not_empty be based on nested-ness of tag stack
    var varname = 'G.forloop_not_empty' + G.s.length;
    var old_end = G.s.pop()[1]; // get rid of dangling for
    return {
        'start': varname+'=true;'
            + old_end + '\nif (!'+varname+') {',
        'end': '}'+varname+'=false;',
        'close': 'endfor'
    }
};
/* ********************* */

TinyTiny.tags.cycle = function (n, G) {
    // keep track of cyclers
    if (!G.cycler) { G.cycler = 0; }
    // put cycler in context, since, why not
    var vn = 'x.cyclevar_'+G.cycler++,
        opts = G.trim(n).split(' ');
    return [vn, ' = (', vn, ' || 0) + 1;',
                'l.push([', opts.map(G.e).join(','), ']',
                '[', vn, ' % ', opts.length, ']);'].join('');
};

TinyTiny.tags.comment = function (n, G) {
    return { start: "/*", end: "*/", }
    return { start: "if (false) {", end: "}", }
};

TinyTiny.tags.make_guid = (function () {
    var _guid = 1000;
    var get_guid = function () { return _guid++; }
    return function (n, G) {
        return ["x." + (G.trim(n) || "guid") + " = '" + get_guid() + "';"];
    };
})();

module.exports = TinyTiny;
