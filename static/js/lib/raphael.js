/**
 * A rebuilt Raphael.js, sort of
 */
(function (root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof exports === 'object') {
        exports.Raphael = factory();
    } else {
        root.Raphael = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // callable custom event bus
    function eve(name, scope, ...args) {
        return eve.trigger(name, scope, ...args);
    }

    eve.listeners = {};

    eve.on = function(name, callback) {
        if (typeof callback !== "function") return () => {};
        if (!eve.listeners[name]) eve.listeners[name] = [];
        eve.listeners[name].push(callback);
        return (zIndex) => {
            if (isFinite(zIndex)) callback.zIndex = +zIndex;
        };
    };

    eve.once = function(name, callback) {
        const wrapped = (...args) => {
            eve.off(name, wrapped);
            return callback.apply(this, args);
        };
        return eve.on(name, wrapped);
    };

    eve.off = eve.unbind = function(name, callback) {
        if (!name) {
            eve.listeners = {};
            return;
        }
        if (!callback) {
            delete eve.listeners[name];
            return;
        }
        const list = eve.listeners[name];
        if (list) {
            const idx = list.indexOf(callback);
            if (idx !== -1) list.splice(idx, 1);
            if (list.length === 0) delete eve.listeners[name];
        }
    };

    eve.trigger = function(name, scope, ...args) {
        const listeners = [];
        for (const key of Object.keys(eve.listeners)) {
            if (eve.match(key, name)) {
                listeners.push(...eve.listeners[key]);
            }
        }
        listeners.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const results = [];
        for (const fn of listeners) {
            results.push(fn.apply(scope, args));
        }
        return results;
    };

    eve.match = function(pattern, name) {
        if (pattern === name || pattern === "*") return true;
        const patParts = pattern.split(/[\.\/]/);
        const nameParts = name.split(/[\.\/]/);
        if (patParts.length !== nameParts.length) return false;
        for (let i = 0; i < patParts.length; i++) {
            if (patParts[i] !== "*" && patParts[i] !== nameParts[i]) {
                return false;
            }
        }
        return true;
    };

    window.eve = eve;

    // color parsing and conversion cache
    const colorCache = {};
    function parseColorWithDOM(colorString) {
        if (colorCache[colorString]) return colorCache[colorString];
        const dummy = document.createElement("span");
        dummy.style.display = "none";
        dummy.style.color = colorString;
        document.body.appendChild(dummy);
        const computed = window.getComputedStyle(dummy).color;
        document.body.removeChild(dummy);
        colorCache[colorString] = computed;
        return computed;
    }

    function rgbToHex(r, g, b) {
        const toHex = (x) => {
            const h = Math.min(Math.max(Math.round(x), 0), 255).toString(16);
            return h.length === 1 ? "0" + h : h;
        };
        return "#" + toHex(r) + toHex(g) + toHex(b);
    }

    function getRGB(colorString) {
        if (!colorString || colorString === "none") {
            return { r: -1, g: -1, b: -1, hex: "none", error: 1 };
        }
        const lower = colorString.toLowerCase().trim();
        if (lower === "transparent") {
            return { r: 0, g: 0, b: 0, hex: "transparent", opacity: 0, error: 0 };
        }
        const rgbStr = parseColorWithDOM(colorString);
        const match = rgbStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d\.]+))?\)$/i);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const opacity = match[4] !== undefined ? parseFloat(match[4]) : 1;
            return {
                r, g, b,
                hex: rgbToHex(r, g, b),
                opacity,
                error: 0
            };
        }
        return { r: -1, g: -1, b: -1, hex: "none", error: 1 };
    }

    function hsb2rgb(h, s, b, o) {
        if (typeof h === "object") {
            s = h.s; b = h.b; o = h.o; h = h.h;
        }
        h *= 360;
        const c = b * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = b - c;
        let rVal = 0, gVal = 0, bVal = 0;
        const sector = Math.floor(h / 60) % 6;
        if (sector === 0) { rVal = c; gVal = x; }
        else if (sector === 1) { rVal = x; gVal = c; }
        else if (sector === 2) { gVal = c; bVal = x; }
        else if (sector === 3) { gVal = x; bVal = c; }
        else if (sector === 4) { rVal = x; bVal = c; }
        else if (sector === 5) { rVal = c; bVal = x; }
        rVal += m; gVal += m; bVal += m;
        return {
            r: Math.round(rVal * 255),
            g: Math.round(gVal * 255),
            b: Math.round(bVal * 255),
            hex: rgbToHex(Math.round(rVal * 255), Math.round(gVal * 255), Math.round(bVal * 255)),
            opacity: typeof o === "number" ? o : 1,
            toString() { return this.hex; }
        };
    }

    function hsl2rgb(h, s, l, o) {
        if (typeof h === "object") {
            s = h.s; l = h.l; o = h.o; h = h.h;
        }
        h *= 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let rVal = 0, gVal = 0, bVal = 0;
        const sector = Math.floor(h / 60) % 6;
        if (sector === 0) { rVal = c; gVal = x; }
        else if (sector === 1) { rVal = x; gVal = c; }
        else if (sector === 2) { gVal = c; bVal = x; }
        else if (sector === 3) { gVal = x; bVal = c; }
        else if (sector === 4) { rVal = x; bVal = c; }
        else if (sector === 5) { rVal = c; bVal = x; }
        rVal += m; gVal += m; bVal += m;
        return {
            r: Math.round(rVal * 255),
            g: Math.round(gVal * 255),
            b: Math.round(bVal * 255),
            hex: rgbToHex(Math.round(rVal * 255), Math.round(gVal * 255), Math.round(bVal * 255)),
            opacity: typeof o === "number" ? o : 1,
            toString() { return this.hex; }
        };
    }

    // matrix math engine
    class Matrix {
        constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
            this.a = a;
            this.b = b;
            this.c = c;
            this.d = d;
            this.e = e;
            this.f = f;
        }

        add(a, b, c, d, e, f) {
            if (a instanceof Matrix) {
                const m = a;
                a = m.a; b = m.b; c = m.c; d = m.d; e = m.e; f = m.f;
            }
            const a1 = this.a * a + this.c * b;
            const b1 = this.b * a + this.d * b;
            const c1 = this.a * c + this.c * d;
            const d1 = this.b * c + this.d * d;
            const e1 = this.a * e + this.c * f + this.e;
            const f1 = this.b * e + this.d * f + this.f;

            this.a = a1; this.b = b1; this.c = c1; this.d = d1; this.e = e1; this.f = f1;
            return this;
        }

        invert() {
            const det = this.a * this.d - this.b * this.c;
            if (det === 0) return new Matrix();
            return new Matrix(
                this.d / det,
                -this.b / det,
                -this.c / det,
                this.a / det,
                (this.c * this.f - this.d * this.e) / det,
                (this.b * this.e - this.a * this.f) / det
            );
        }

        clone() {
            return new Matrix(this.a, this.b, this.c, this.d, this.e, this.f);
        }

        translate(x, y) {
            return this.add(1, 0, 0, 1, x, y);
        }

        scale(x, y, cx = 0, cy = 0) {
            if (y === undefined) y = x;
            if (cx || cy) this.add(1, 0, 0, 1, cx, cy);
            this.add(x, 0, 0, y, 0, 0);
            if (cx || cy) this.add(1, 0, 0, 1, -cx, -cy);
            return this;
        }

        rotate(angle, cx = 0, cy = 0) {
            const rad = (angle * Math.PI) / 180;
            const cos = parseFloat(Math.cos(rad).toFixed(9));
            const sin = parseFloat(Math.sin(rad).toFixed(9));
            this.add(cos, sin, -sin, cos, cx, cy);
            this.add(1, 0, 0, 1, -cx, -cy);
            return this;
        }

        x(x, y) {
            return x * this.a + y * this.c + this.e;
        }

        y(x, y) {
            return x * this.b + y * this.d + this.f;
        }

        split() {
            const out = { dx: this.e, dy: this.f };
            const scaleX = Math.sqrt(this.a * this.a + this.b * this.b);
            const normA = scaleX ? this.a / scaleX : 0;
            const normB = scaleX ? this.b / scaleX : 0;

            const shear = normA * this.c + normB * this.d;
            const cX = this.c - normA * shear;
            const cY = this.d - normB * shear;

            const scaleY = Math.sqrt(cX * cX + cY * cY);
            const shearNormalized = scaleY ? shear / scaleY : 0;

            out.scalex = scaleX;
            out.scaley = scaleY;
            out.shear = shearNormalized;

            const r = -normB;
            const val = cY;

            if (val < 0) {
                out.rotate = (Math.acos(val) * 180) / Math.PI;
                if (r < 0) out.rotate = 360 - out.rotate;
            } else {
                out.rotate = (Math.asin(r) * 180) / Math.PI;
            }

            out.isSimple = !(
                +out.shear.toFixed(9) ||
                (out.scalex.toFixed(9) !== out.scaley.toFixed(9) && out.rotate)
            );
            out.isSuperSimple =
                !+out.shear.toFixed(9) &&
                out.scalex.toFixed(9) === out.scaley.toFixed(9) &&
                !out.rotate;
            out.noRotation = !+out.shear.toFixed(9) && !out.rotate;

            return out;
        }

        toTransformString(splitData) {
            const t = splitData || this.split();
            if (t.isSimple) {
                t.scalex = +t.scalex.toFixed(4);
                t.scaley = +t.scaley.toFixed(4);
                t.rotate = +t.rotate.toFixed(4);
                const trans = t.dx || t.dy ? `t${t.dx},${t.dy}` : "";
                const scale = (t.scalex !== 1 || t.scaley !== 1) ? `s${t.scalex},${t.scaley},0,0` : "";
                const rot = t.rotate ? `r${t.rotate},0,0` : "";
                return trans + scale + rot;
            }
            return `m${this.a},${this.b},${this.c},${this.d},${this.e},${this.f}`;
        }

        toString() {
            return `matrix(${this.a.toFixed(4)},${this.b.toFixed(4)},${this.c.toFixed(4)},${this.d.toFixed(4)},${this.e.toFixed(4)},${this.f.toFixed(4)})`;
        }
    }

    // logic for parsing and converting SVG path strings
    const pathCommandRegex = /([achlmrqstvz])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/gi;
    const numberRegex = /(-?\d*\.?\d*(?:e[\-+]?\d+)?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/gi;

    function pathToString() {
        return this.map(x => x[0] + x.slice(1).join(",")).join("");
    }

    function parsePathString(pathString) {
        if (!pathString) return null;
        if (Array.isArray(pathString) && Array.isArray(pathString[0])) {
            const copy = pathString.map(x => [...x]);
            copy.toString = pathToString;
            return copy;
        }

        const paramCounts = { a: 7, c: 6, h: 1, l: 2, m: 2, r: 4, q: 4, s: 4, t: 2, v: 1, z: 0 };
        const data = [];

        String(pathString).replace(pathCommandRegex, (match, command, args) => {
            const params = [];
            const lcCommand = command.toLowerCase();
            args.replace(numberRegex, (numMatch, num) => {
                if (num) params.push(+num);
            });

            let currentLc = lcCommand;
            let currentCmd = command;

            if (currentLc === "m" && params.length > 2) {
                data.push([currentCmd].concat(params.splice(0, 2)));
                currentCmd = currentCmd === "m" ? "l" : "L";
                currentLc = "l";
            }

            if (currentLc === "r") {
                data.push([currentCmd].concat(params));
            } else {
                while (params.length >= paramCounts[currentLc]) {
                    data.push([currentCmd].concat(params.splice(0, paramCounts[currentLc])));
                    if (!paramCounts[currentLc]) break;
                }
            }
        });
        data.toString = pathToString;
        return data;
    }

    function catmullRomToCubic(t, e) {
        const r = [];
        for (let i = 0, n = t.length; i < n - 2 * !e; i += 2) {
            const s = [
                { x: +t[i - 2], y: +t[i - 1] },
                { x: +t[i], y: +t[i + 1] },
                { x: +t[i + 2], y: +t[i + 3] },
                { x: +t[i + 4], y: +t[i + 5] }
            ];
            if (e) {
                if (!i) {
                    s[0] = { x: +t[n - 2], y: +t[n - 1] };
                } else if (n - 4 === i) {
                    s[3] = { x: +t[0], y: +t[1] };
                } else if (n - 2 === i) {
                    s[2] = { x: +t[0], y: +t[1] };
                    s[3] = { x: +t[2], y: +t[3] };
                }
            } else {
                if (n - 4 === i) {
                    s[3] = s[2];
                } else if (!i) {
                    s[0] = { x: +t[i], y: +t[i + 1] };
                }
            }
            r.push([
                "C",
                (-s[0].x + 6 * s[1].x + s[2].x) / 6,
                (-s[0].y + 6 * s[1].y + s[2].y) / 6,
                (s[1].x + 6 * s[2].x - s[3].x) / 6,
                (s[1].y + 6 * s[2].y - s[3].y) / 6,
                s[2].x,
                s[2].y
            ]);
        }
        return r;
    }

    function pathToAbsolute(pathString) {
        const path = parsePathString(pathString);
        if (!path || !path.length) return [["M", 0, 0]];
        const res = [];
        let x = 0, y = 0, mx = 0, my = 0, start = 0;

        if (path[0][0] === "M" || path[0][0] === "m") {
            x = +path[0][1];
            y = +path[0][2];
            mx = x;
            my = y;
            res.push(["M", x, y]);
            start = 1;
        }

        const isClosedCR = (
            path.length === 3 &&
            path[0][0] === "M" &&
            path[1][0].toUpperCase() === "R" &&
            path[2][0].toUpperCase() === "Z"
        );

        for (let i = start; i < path.length; i++) {
            const h = path[i];
            const cmd = h[0];
            const upperCmd = cmd.toUpperCase();
            let l = [];

            if (cmd !== upperCmd) {
                l[0] = upperCmd;
                switch (upperCmd) {
                    case "A":
                        l[1] = h[1]; l[2] = h[2]; l[3] = h[3]; l[4] = h[4]; l[5] = h[5];
                        l[6] = +(h[6] + x); l[7] = +(h[7] + y);
                        break;
                    case "V":
                        l[1] = +h[1] + y;
                        break;
                    case "H":
                        l[1] = +h[1] + x;
                        break;
                    case "R": {
                        const pts = [x, y].concat(h.slice(1));
                        for (let d = 2; d < pts.length; d++) {
                            pts[d] = +pts[d] + x;
                            pts[++d] = +pts[d] + y;
                        }
                        res.pop();
                        res.push(...catmullRomToCubic(pts, isClosedCR));
                        l = ["R"].concat(h.slice(-2));
                        break;
                    }
                    case "M":
                        mx = +h[1] + x;
                        my = +h[2] + y;
                    default:
                        for (let d = 1; d < h.length; d++) {
                            l[d] = +h[d] + (d % 2 ? x : y);
                        }
                }
            } else if (cmd === "R") {
                const pts = [x, y].concat(h.slice(1));
                res.pop();
                res.push(...catmullRomToCubic(pts, isClosedCR));
                l = ["R"].concat(h.slice(-2));
            } else {
                for (let d = 0; d < h.length; d++) {
                    l[d] = h[d];
                }
            }

            switch (l[0]) {
                case "Z":
                    x = mx; y = my;
                    break;
                case "H":
                    x = l[1];
                    break;
                case "V":
                    y = l[1];
                    break;
                case "M":
                    mx = l[l.length - 2];
                    my = l[l.length - 1];
                default:
                    x = l[l.length - 2];
                    y = l[l.length - 1];
            }
            if (cmd !== "R" && upperCmd !== "R") {
                res.push(l);
            }
        }
        res.toString = pathToString;
        return res;
    }

    function pathToRelative(pathString) {
        const path = parsePathString(pathString);
        if (!path || !path.length) return [["M", 0, 0]];
        const res = [];
        let x = 0, y = 0, mx = 0, my = 0;

        if (path[0][0] === "M") {
            x = +path[0][1];
            y = +path[0][2];
            mx = x;
            my = y;
            res.push(["M", x, y]);
        }

        for (let i = 1; i < path.length; i++) {
            const segment = path[i];
            const cmd = segment[0];
            const lowerCmd = cmd.toLowerCase();
            const relSegment = [lowerCmd];

            if (cmd !== lowerCmd) {
                switch (lowerCmd) {
                    case "a":
                        relSegment.push(segment[1], segment[2], segment[3], segment[4], segment[5], +(segment[6] - x).toFixed(3), +(segment[7] - y).toFixed(3));
                        break;
                    case "v":
                        relSegment.push(+(segment[1] - y).toFixed(3));
                        break;
                    case "h":
                        relSegment.push(+(segment[1] - x).toFixed(3));
                        break;
                    case "m":
                        mx = segment[1];
                        my = segment[2];
                        relSegment.push(+(segment[1] - x).toFixed(3), +(segment[2] - y).toFixed(3));
                        break;
                    default:
                        for (let j = 1; j < segment.length; j++) {
                            relSegment.push(+(segment[j] - (j % 2 ? x : y)).toFixed(3));
                        }
                }
            } else {
                if (lowerCmd === "m") {
                    mx = segment[1] + x;
                    my = segment[2] + y;
                }
                relSegment.push(...segment.slice(1));
            }

            const len = relSegment.length;
            switch (lowerCmd) {
                case "z":
                    x = mx; y = my;
                    break;
                case "h":
                    x += relSegment[1];
                    break;
                case "v":
                    y += relSegment[1];
                    break;
                default:
                    x += relSegment[len - 2];
                    y += relSegment[len - 1];
            }
            res.push(relSegment);
        }
        res.toString = pathToString;
        return res;
    }

    function arcToCurves(x1, y1, rx, ry, angle, large_arc_flag, sweep_flag, x2, y2, recursive) {
        const PI = Math.PI;
        const rad = (PI / 180) * (angle || 0);
        const rotate = (x, y, r) => ({
            x: x * Math.cos(r) - y * Math.sin(r),
            y: x * Math.sin(r) + y * Math.cos(r)
        });

        let f = [];
        let startAngle, endAngle, cx, cy;

        if (recursive) {
            startAngle = recursive[0];
            endAngle = recursive[1];
            cx = recursive[2];
            cy = recursive[3];
        } else {
            const p1 = rotate(x1, y1, -rad);
            const p2 = rotate(x2, y2, -rad);
            const x1r = p1.x; const y1r = p1.y;
            const x2r = p2.x; const y2r = p2.y;

            const dx = (x1r - x2r) / 2;
            const dy = (y1r - y2r) / 2;

            let lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            if (lambda > 1) {
                const sqrtLambda = Math.sqrt(lambda);
                rx *= sqrtLambda;
                ry *= sqrtLambda;
            }

            const rx2 = rx * rx;
            const ry2 = ry * ry;

            const sign = large_arc_flag === sweep_flag ? -1 : 1;
            const numerator = rx2 * ry2 - rx2 * dy * dy - ry2 * dx * dx;
            const denominator = rx2 * dy * dy + ry2 * dx * dx;
            let sq = sign * Math.sqrt(Math.abs(numerator / denominator));

            cx = (sq * rx * dy) / ry + (x1r + x2r) / 2;
            cy = (sq * -ry * dx) / rx + (y1r + y2r) / 2;

            startAngle = Math.asin(((y1r - cy) / ry).toFixed(9));
            endAngle = Math.asin(((y2r - cy) / ry).toFixed(9));

            if (x1r < cx) startAngle = PI - startAngle;
            if (x2r < cx) endAngle = PI - endAngle;

            if (startAngle < 0) startAngle += 2 * PI;
            if (endAngle < 0) endAngle += 2 * PI;

            if (sweep_flag && endAngle < startAngle) {
                startAngle -= 2 * PI;
            }
            if (!sweep_flag && startAngle < endAngle) {
                endAngle -= 2 * PI;
            }
        }

        let deltaAngle = endAngle - startAngle;
        const maxDelta = (120 * PI) / 180;

        if (Math.abs(deltaAngle) > maxDelta) {
            const endAngleBackup = endAngle;
            const x2Backup = x2;
            const y2Backup = y2;

            endAngle = startAngle + maxDelta * (sweep_flag && startAngle < endAngle ? 1 : -1);
            x2 = cx + rx * Math.cos(endAngle);
            y2 = cy + ry * Math.sin(endAngle);

            f = arcToCurves(x2, y2, rx, ry, angle, 0, sweep_flag, x2Backup, y2Backup, [endAngle, endAngleBackup, cx, cy]);
        }

        deltaAngle = endAngle - startAngle;
        let startX = startAngle;
        const cosStart = Math.cos(startX);
        const sinStart = Math.sin(startX);
        const cosEnd = Math.cos(endAngle);
        const sinEnd = Math.sin(endAngle);

        const tanDeltaDiv4 = Math.tan(deltaAngle / 4);
        const factorX = (4 / 3) * rx * tanDeltaDiv4;
        const factorY = (4 / 3) * ry * tanDeltaDiv4;

        const cp1x = x1 + factorX * sinStart;
        const cp1y = y1 - factorY * cosStart;
        const cp2x = x2 + factorX * sinEnd;
        const cp2y = y2 - factorY * cosEnd;

        const curves = [cp1x, cp1y, cp2x, cp2y, x2, y2];

        if (recursive) {
            return curves.concat(f);
        }

        const result = [];
        for (let i = 0; i < curves.length; i += 6) {
            const pCp1 = rotate(curves[i], curves[i+1], rad);
            const pCp2 = rotate(curves[i+2], curves[i+3], rad);
            const pEnd = rotate(curves[i+4], curves[i+5], rad);
            result.push(pCp1.x, pCp1.y, pCp2.x, pCp2.y, pEnd.x, pEnd.y);
        }
        return result;
    }

    function lineToCubic(x1, y1, x2, y2) {
        return [
            (1/3) * x1 + (2/3) * x2,
            (1/3) * y1 + (2/3) * y2,
            (1/3) * x2 + (2/3) * x1,
            (1/3) * y2 + (2/3) * y1,
            x2,
            y2
        ];
    }

    function quadraticToCubic(x1, y1, qx, qy, x2, y2) {
        return [
            (1/3) * x1 + (2/3) * qx,
            (1/3) * y1 + (2/3) * qy,
            (1/3) * x2 + (2/3) * qx,
            (1/3) * y2 + (2/3) * qy,
            x2,
            y2
        ];
    }

    function equalizeCurves(c1, c2) {
        const maxLen = Math.max(c1.length, c2.length);
        const pad = (curve, count) => {
            if (curve.length === 0) return;
            const last = curve[curve.length - 1];
            while (curve.length < count) {
                curve.push(["C", last[5], last[6], last[5], last[6], last[5], last[6]]);
            }
        };
        pad(c1, maxLen);
        pad(c2, maxLen);
    }

    function path2curve(path, path2) {
        const p = pathToAbsolute(path);
        const p2 = path2 && pathToAbsolute(path2);

        const r = { x: 0, y: 0, bx: 0, by: 0, X: 0, Y: 0, qx: null, qy: null };
        const r2 = { x: 0, y: 0, bx: 0, by: 0, X: 0, Y: 0, qx: null, qy: null };

        const process = (p, state) => {
            if (!p) return null;
            const res = [];
            let lastCmd = "";
            for (let i = 0; i < p.length; i++) {
                const cmd = p[i];
                let type = cmd[0];
                let current = [...cmd];

                if (type !== "T" && type !== "Q") {
                    state.qx = state.qy = null;
                }

                switch (type) {
                    case "M":
                        state.X = current[1];
                        state.Y = current[2];
                        break;
                    case "A":
                        const curves = arcToCurves(state.x, state.y, current[1], current[2], current[3], current[4], current[5], current[6], current[7]);
                        for (let j = 0; j < curves.length; j += 6) {
                            res.push(["C", curves[j], curves[j+1], curves[j+2], curves[j+3], curves[j+4], curves[j+5]]);
                        }
                        state.x = current[6];
                        state.y = current[7];
                        continue;
                    case "S": {
                        let bx = state.x; let by = state.y;
                        if (lastCmd === "C" || lastCmd === "S") {
                            bx = 2 * state.x - state.bx;
                            by = 2 * state.y - state.by;
                        }
                        current = ["C", bx, by, current[1], current[2], current[3], current[4]];
                        break;
                    }
                    case "T": {
                        if (lastCmd === "Q" || lastCmd === "T") {
                            state.qx = 2 * state.x - state.qx;
                            state.qy = 2 * state.y - state.qy;
                        } else {
                            state.qx = state.x; state.qy = state.y;
                        }
                        current = ["C", ...quadraticToCubic(state.x, state.y, state.qx, state.qy, current[1], current[2])];
                        break;
                    }
                    case "Q": {
                        state.qx = current[1]; state.qy = current[2];
                        current = ["C", ...quadraticToCubic(state.x, state.y, current[1], current[2], current[3], current[4])];
                        break;
                    }
                    case "L":
                        current = ["C", ...lineToCubic(state.x, state.y, current[1], current[2])];
                        break;
                    case "H":
                        current = ["C", ...lineToCubic(state.x, state.y, current[1], state.y)];
                        break;
                    case "V":
                        current = ["C", ...lineToCubic(state.x, state.y, state.x, current[1])];
                        break;
                    case "Z":
                        current = ["C", ...lineToCubic(state.x, state.y, state.X, state.Y)];
                        break;
                }

                res.push(current);
                lastCmd = current[0];

                const len = current.length;
                state.x = current[len - 2];
                state.y = current[len - 1];
                state.bx = parseFloat(current[len - 4]) || state.x;
                state.by = parseFloat(current[len - 3]) || state.y;
            }
            return res;
        };

        const c1 = process(p, r);
        const c2 = p2 ? process(p2, r2) : null;

        if (c1 && c2) {
            equalizeCurves(c1, c2);
            return [c1, c2];
        }
        return c1;
    }

    function getBezierDerivativeValue(t, p0, p1, p2, p3) {
        return t * (t * (-3 * p0 + 9 * p1 - 9 * p2 + 3 * p3) + 6 * p0 - 12 * p1 + 6 * p2) - 3 * p0 + 3 * p1;
    }

    function getBezierLength(x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2, lengthFraction = 1) {
        const tVal = Math.min(Math.max(lengthFraction, 0), 1) / 2;
        const T_VALUES = [-0.1252, 0.1252, -0.3678, 0.3678, -0.5873, 0.5873, -0.7699, 0.7699, -0.9041, 0.9041, -0.9816, 0.9816];
        const WEIGHTS = [0.2491, 0.2491, 0.2335, 0.2335, 0.2032, 0.2032, 0.1601, 0.1601, 0.1069, 0.1069, 0.0472, 0.0472];
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const t = tVal * T_VALUES[i] + tVal;
            const dx = getBezierDerivativeValue(t, x1, cp1x, cp2x, x2);
            const dy = getBezierDerivativeValue(t, y1, cp1y, cp2y, y2);
            sum += WEIGHTS[i] * Math.sqrt(dx * dx + dy * dy);
        }
        return tVal * sum;
    }

    function findDotsAtSegment(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t) {
        const mt = 1 - t;
        const mt3 = Math.pow(mt, 3);
        const mt2 = Math.pow(mt, 2);
        const t2 = t * t;
        const t3 = t2 * t;

        const x = mt3 * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * p3x;
        const y = mt3 * p0y + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * p3y;

        const mX = p0x + 2 * t * (p1x - p0x) + t2 * (p2x - 2 * p1x + p0x);
        const mY = p0y + 2 * t * (p1y - p0y) + t2 * (p2y - 2 * p1y + p0y);
        const nX = p1x + 2 * t * (p2x - p1x) + t2 * (p3x - 2 * p2x + p1x);
        const nY = p1y + 2 * t * (p2y - p1y) + t2 * (p3y - 2 * p2y + p1y);

        const startX = mt * p0x + t * p1x;
        const startY = mt * p0y + t * p1y;
        const endX = mt * p2x + t * p3x;
        const endY = mt * p2y + t * p3y;

        let alpha = 90 - (180 * Math.atan2(mX - nX, mY - nY)) / Math.PI;
        if (nX < mX || mY < nY) alpha += 180;

        return {
            x, y,
            m: { x: mX, y: mY },
            n: { x: nX, y: nY },
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            alpha: (alpha + 360) % 360
        };
    }

    function bezierBBox(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
        if (Array.isArray(p0x)) return bezierBBox(...p0x);
        const hX = p2x - 2 * p1x + p0x - (p3x - 2 * p2x + p1x);
        const uX = 2 * (p1x - p0x) - 2 * (p2x - p1x);
        const cX = p0x - p1x;

        let t1X = (-uX + Math.sqrt(uX * uX - 4 * hX * cX)) / (2 * hX);
        let t2X = (-uX - Math.sqrt(uX * uX - 4 * hX * cX)) / (2 * hX);

        const xValues = [p0x, p3x];
        const yValues = [p0y, p3y];

        if (Math.abs(t1X) > 1e12) t1X = 0.5;
        if (Math.abs(t2X) > 1e12) t2X = 0.5;

        if (t1X > 0 && t1X < 1) {
            const pt = findDotsAtSegment(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t1X);
            xValues.push(pt.x); yValues.push(pt.y);
        }
        if (t2X > 0 && t2X < 1) {
            const pt = findDotsAtSegment(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t2X);
            xValues.push(pt.x); yValues.push(pt.y);
        }

        const hY = p2y - 2 * p1y + p0y - (p3y - 2 * p2y + p1y);
        const uY = 2 * (p1y - p0y) - 2 * (p2y - p1y);
        const cY = p0y - p1y;

        let t1Y = (-uY + Math.sqrt(uY * uY - 4 * hY * cY)) / (2 * hY);
        let t2Y = (-uY - Math.sqrt(uY * uY - 4 * hY * cY)) / (2 * hY);

        if (Math.abs(t1Y) > 1e12) t1Y = 0.5;
        if (Math.abs(t2Y) > 1e12) t2Y = 0.5;

        if (t1Y > 0 && t1Y < 1) {
            const pt = findDotsAtSegment(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t1Y);
            xValues.push(pt.x); yValues.push(pt.y);
        }
        if (t2Y > 0 && t2Y < 1) {
            const pt = findDotsAtSegment(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t2Y);
            xValues.push(pt.x); yValues.push(pt.y);
        }

        const minX = Math.min(...xValues); const minY = Math.min(...yValues);
        const maxX = Math.max(...xValues); const maxY = Math.max(...yValues);

        return {
            x: minX, y: minY, x2: maxX, y2: maxY,
            width: maxX - minX, height: maxY - minY
        };
    }

    function pathBBox(pathString) {
        const path = path2curve(pathString);
        if (!path || !path.length) return { x: 0, y: 0, width: 0, height: 0, x2: 0, y2: 0 };
        let nX = 0, nY = 0;
        const xValues = []; const yValues = [];

        for (let i = 0; i < path.length; i++) {
            const cmd = path[i];
            if (cmd[0] === "M") {
                nX = cmd[1]; nY = cmd[2];
                xValues.push(nX); yValues.push(nY);
            } else if (cmd[0] === "C") {
                const bbox = bezierBBox(nX, nY, cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
                xValues.push(bbox.x, bbox.x2);
                yValues.push(bbox.y, bbox.y2);
                nX = cmd[5]; nY = cmd[6];
            }
        }

        const minX = Math.min(...xValues); const minY = Math.min(...yValues);
        const maxX = Math.max(...xValues); const maxY = Math.max(...yValues);

        return {
            x: minX, y: minY, x2: maxX, y2: maxY,
            width: maxX - minX, height: maxY - minY,
            cx: minX + (maxX - minX) / 2,
            cy: minY + (maxY - minY) / 2
        };
    }

    function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        if (
            Math.max(x1, x2) < Math.min(x3, x4) ||
            Math.min(x1, x2) > Math.max(x3, x4) ||
            Math.max(y1, y2) < Math.min(y3, y4) ||
            Math.min(y1, y2) > Math.max(y3, y4)
        ) {
            return null;
        }

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return null;

        const num1 = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4);
        const num2 = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4);

        const x = num1 / denom;
        const y = num2 / denom;

        const pad = 0.01;
        if (
            x >= Math.min(x1, x2) - pad && x <= Math.max(x1, x2) + pad &&
            y >= Math.min(y1, y2) - pad && y <= Math.max(y1, y2) + pad &&
            x >= Math.min(x3, x4) - pad && x <= Math.max(x3, x4) + pad &&
            y >= Math.min(y3, y4) - pad && y <= Math.max(y3, y4) + pad
        ) {
            return { x, y };
        }
        return null;
    }

    function getBezierIntersection(b1, b2, justCount = false) {
        const bounds1 = bezierBBox(b1);
        const bounds2 = bezierBBox(b2);
        if (!isBBoxIntersect(bounds1, bounds2)) return justCount ? 0 : [];

        const len1 = getBezierLength(...b1);
        const len2 = getBezierLength(...b2);
        const steps1 = Math.max(Math.floor(len1 / 5), 1);
        const steps2 = Math.max(Math.floor(len2 / 5), 1);

        const pts1 = []; const pts2 = [];

        for (let i = 0; i <= steps1; i++) {
            const pt = findDotsAtSegment(...b1, i / steps1);
            pts1.push({ x: pt.x, y: pt.y, t: i / steps1 });
        }
        for (let i = 0; i <= steps2; i++) {
            const pt = findDotsAtSegment(...b2, i / steps2);
            pts2.push({ x: pt.x, y: pt.y, t: i / steps2 });
        }

        const visited = {};
        let count = 0;
        const results = [];

        for (let i = 0; i < steps1; i++) {
            for (let j = 0; j < steps2; j++) {
                const s1 = pts1[i]; const e1 = pts1[i + 1];
                const s2 = pts2[j]; const e2 = pts2[j + 1];

                const intersect = lineIntersection(s1.x, s1.y, e1.x, e1.y, s2.x, s2.y, e2.x, e2.y);
                if (intersect) {
                    const keyX = intersect.x.toFixed(4);
                    const keyY = intersect.y.toFixed(4);
                    if (visited[keyX] !== keyY) {
                        visited[keyX] = keyY;
                        const t1 = s1.t + Math.abs((intersect.x - s1.x) / (e1.x - s1.x)) * (e1.t - s1.t);
                        const t2 = s2.t + Math.abs((intersect.x - s2.x) / (e2.x - s2.x)) * (e2.t - s2.t);

                        if (t1 >= 0 && t1 <= 1.001 && t2 >= 0 && t2 <= 1.001) {
                            if (justCount) {
                                count++;
                            } else {
                                results.push({
                                    x: intersect.x,
                                    y: intersect.y,
                                    t1: Math.min(t1, 1),
                                    t2: Math.min(t2, 1)
                                });
                            }
                        }
                    }
                }
            }
        }
        return justCount ? count : results;
    }

    function pathIntersection(path1, path2, justCount = false) {
        const c1 = path2curve(path1);
        const c2 = path2curve(path2);
        let count = 0;
        const results = [];

        let lx1 = 0, ly1 = 0;
        for (let i = 0; i < c1.length; i++) {
            const seg1 = c1[i];
            if (seg1[0] === "M") {
                lx1 = seg1[1]; ly1 = seg1[2];
                continue;
            }

            const b1 = [lx1, ly1, seg1[1], seg1[2], seg1[3], seg1[4], seg1[5], seg1[6]];
            lx1 = seg1[5]; ly1 = seg1[6];

            let lx2 = 0, ly2 = 0;
            for (let j = 0; j < c2.length; j++) {
                const seg2 = c2[j];
                if (seg2[0] === "M") {
                    lx2 = seg2[1]; ly2 = seg2[2];
                    continue;
                }

                const b2 = [lx2, ly2, seg2[1], seg2[2], seg2[3], seg2[4], seg2[5], seg2[6]];
                lx2 = seg2[5]; ly2 = seg2[6];

                const matches = getBezierIntersection(b1, b2, justCount);
                if (justCount) {
                    count += matches;
                } else {
                    for (const pt of matches) {
                        pt.segment1 = i; pt.segment2 = j;
                        pt.bez1 = b1; pt.bez2 = b2;
                        results.push(pt);
                    }
                }
            }
        }
        return justCount ? count : results;
    }

    function isPointInsideBBox(bbox, x, y) {
        return x >= bbox.x && x <= bbox.x2 && y >= bbox.y && y <= bbox.y2;
    }

    function isBBoxIntersect(b1, b2) {
        return (
            b1.x < b2.x2 && b1.x2 > b2.x &&
            b1.y < b2.y2 && b1.y2 > b2.y
        );
    }

    function isPointInsidePath(path, x, y) {
        const bbox = pathBBox(path);
        if (!isPointInsideBBox(bbox, x, y)) return false;
        const ray = [["M", x, y], ["H", bbox.x2 + 10]];
        const intersections = pathIntersection(path, ray, true);
        return intersections % 2 === 1;
    }

    // default schema for SVG element attributes
    const AVAILABLE_ATTRS = {
        "arrow-end": "none", "arrow-start": "none", blur: 0,
        "clip-rect": "0 0 1e9 1e9", cursor: "default", cx: 0, cy: 0,
        fill: "#fff", "fill-opacity": 1, font: '10px "Arial"',
        "font-family": '"Arial"', "font-size": "10", "font-style": "normal",
        "font-weight": 400, gradient: 0, height: 0, href: "http://raphaeljs.com/",
        "letter-spacing": 0, opacity: 1, path: "M0,0", r: 0, rx: 0, ry: 0,
        src: "", stroke: "#000", "stroke-dasharray": "", "stroke-linecap": "butt",
        "stroke-linejoin": "butt", "stroke-miterlimit": 0, "stroke-opacity": 1,
        "stroke-width": 1, target: "_blank", "text-anchor": "middle",
        title: "Raphael", transform: "", width: 0, x: 0, y: 0, class: ""
    };

    // simple Set implementation for internal use
    class Set {
        constructor(items = []) {
            this.items = [];
            this.length = 0;
            if (items) {
                for (const item of items) {
                    this.push(item);
                }
            }
        }

        push(...args) {
            for (const item of args) {
                if (item) {
                    this.items.push(item);
                    this[this.length] = item;
                    this.length++;
                }
            }
            return this;
        }

        pop() {
            if (this.length > 0) {
                const item = this.items.pop();
                delete this[this.length - 1];
                this.length--;
                return item;
            }
        }

        forEach(callback, thisArg) {
            for (let i = 0; i < this.items.length; i++) {
                if (callback.call(thisArg, this.items[i], i) === false) {
                    break;
                }
            }
            return this;
        }

        clear() {
            while (this.length > 0) {
                this.pop();
            }
        }

        splice(index, count, ...insertItems) {
            index = index < 0 ? Math.max(this.length + index, 0) : index;
            count = Math.max(0, Math.min(this.length - index, count));
            const removed = [];
            for (let i = 0; i < count; i++) {
                removed.push(this[index + i]);
            }
            const tail = this.items.slice(index + count);
            this.items.length = index;
            for (const item of insertItems) {
                this.push(item);
            }
            for (const item of tail) {
                this.push(item);
            }
            return new Set(removed);
        }

        exclude(item) {
            const idx = this.items.indexOf(item);
            if (idx !== -1) {
                this.splice(idx, 1);
                return true;
            }
            return false;
        }
    }

    // a modernized base class for Raphael elements
    class RaphaelElement {
        constructor(node, paper) {
            this.node = node;
            this.paper = paper;
            this.id = Raphael.createUUID();
            this.node.raphaelid = this.id;
            this.matrix = new Matrix();
            this.attrs = {};
            this.customData = {}; // internal data storage
            this.removed = false;
            this.events = [];
            this._ = {
                transform: [],
                sx: 1, sy: 1,
                dx: 0, dy: 0,
                deg: 0,
                dirty: true
            };
        }

        attr(name, value) {
            if (this.removed) return this;
            if (name === undefined) {
                const out = {};
                for (const k of Object.keys(this.attrs)) out[k] = this.attrs[k];
                return out;
            }

            if (value === undefined && typeof name === "string") {
                return this.attrs[name] !== undefined ? this.attrs[name] : AVAILABLE_ATTRS[name];
            }

            if (typeof name === "object") {
                for (const key of Object.keys(name)) {
                    this.setAttributeValue(key, name[key]);
                }
            } else {
                this.setAttributeValue(name, value);
            }
            return this;
        }

        setAttributeValue(name, value) {
            if (this.attrs[name] === value) {
                return;
            }

            const ca = this.paper.customAttributes[name] || Raphael.customAttributes[name];
            if (ca) {
                const generated = ca.call(this, value);
                this.attr(generated);
                this.attrs[name] = value;
                return;
            }
            this.attrs[name] = value;

            if (name === "path" && this.type === "path") {
                this.node.setAttribute("d", pathToAbsolute(value).toString());
            } else if (name === "transform") {
                this.transform(value);
            } else if (AVAILABLE_ATTRS[name] !== undefined) {
                if (name === "font-size" && typeof value === "number") {
                    this.node.setAttribute(name, value + "px");
                } else {
                    this.node.setAttribute(name, value);
                }
                
                const camelName = name.replace(/-([a-z])/g, (m, letter) => letter.toUpperCase());
                try {
                    this.node.style[camelName] = value;
                } catch (e) {}
            }

            if (this.type === "text" && (name === "text" || name === "x" || name === "y" || name === "font-size" || name === "font")) {
                updateTextElement(this);
            }
        }

        data(key, value) {
            if (this.removed) return this;
            if (key === undefined) {
                return this.customData;
            }
            if (value === undefined) {
                if (typeof key === "object") {
                    for (const k of Object.keys(key)) {
                        this.data(k, key[k]);
                    }
                    return this;
                }
                return this.customData[key];
            }
            this.customData[key] = value;
            eve("raphael.data.set." + this.id, this, value, key);
            return this;
        }

        removeData(key) {
            if (key === undefined) {
                this.customData = {};
            } else {
                delete this.customData[key];
            }
            return this;
        }

        getBBox(isActual) {
            if (this.removed) return {};
            if (this.type === "path") {
                return pathBBox(this.attr("path"));
            }
            const bounds = this.node.getBBox();
            return {
                x: bounds.x, y: bounds.y,
                x2: bounds.x + bounds.width,
                y2: bounds.y + bounds.height,
                width: bounds.width, height: bounds.height
            };
        }

        transform(transformStr) {
            if (transformStr === undefined) return this._.transform;
            this._.transform = Raphael.parseTransformString(transformStr);
            const m = new Matrix();
            for (const t of this._.transform) {
                const cmd = t[0].toLowerCase();
                if (cmd === "t") m.translate(t[1], t[2]);
                else if (cmd === "s") m.scale(t[1], t[2], t[3] || 0, t[4] || 0);
                else if (cmd === "r") m.rotate(t[1], t[2] || 0, t[3] || 0);
                else if (cmd === "m") m.add(t[1], t[2], t[3], t[4], t[5], t[6]);
            }
            this.matrix = m;
            this.node.setAttribute("transform", m.toString());
            return this;
        }

        rotate(deg, cx, cy) {
            return this.transform(`...r${deg},${cx},${cy}`);
        }

        scale(sx, sy, cx, cy) {
            return this.transform(`...s${sx},${sy},${cx},${cy}`);
        }

        translate(dx, dy) {
            return this.transform(`...t${dx},${dy}`);
        }

        hide() {
            this.node.style.display = "none";
            return this;
        }

        show() {
            this.node.style.display = "";
            return this;
        }

        remove() {
            if (this.removed) return;
            eve("raphael.remove", this);
            if (this.node && this.node.parentNode) {
                this.node.parentNode.removeChild(this.node);
            }
            this.removed = true;
        }

        toFront() {
            if (this.node && this.node.parentNode) {
                this.node.parentNode.appendChild(this.node);
            }
            return this;
        }

        toBack() {
            if (this.node && this.node.parentNode) {
                this.node.parentNode.insertBefore(this.node, this.node.parentNode.firstChild);
            }
            return this;
        }

        insertAfter(el) {
            if (el && el.node && el.node.parentNode) {
                el.node.parentNode.insertBefore(this.node, el.node.nextSibling);
            }
            return this;
        }

        insertBefore(el) {
            if (el && el.node && el.node.parentNode) {
                el.node.parentNode.insertBefore(this.node, el.node);
            }
            return this;
        }

        clone() {
            if (this.removed) return null;
            const clonedNode = this.node.cloneNode(true);
            this.node.parentNode.appendChild(clonedNode);
            const cloneEl = new RaphaelElement(clonedNode, this.paper);
            cloneEl.type = this.type;
            cloneEl.attrs = { ...this.attrs };
            cloneEl.transform(this.transform());
            return cloneEl;
        }

        hover(fIn, fOut, scopeIn, scopeOut) {
            return this.mouseover(fIn, scopeIn).mouseout(fOut, scopeOut);
        }

        unhover(fIn, fOut) {
            return this.unmouseover(fIn).unmouseout(fOut);
        }

        drag(onmove, onstart, onend, mScope, sScope, eScope) {
            this._drag = { x: 0, y: 0, active: false };

            const startHandler = (e) => {
                e.preventDefault();
                const coords = this.getPointerCoords(e);
                this._drag.x = coords.x;
                this._drag.y = coords.y;
                this._drag.active = true;
                if (onstart) onstart.call(sScope || mScope || this, coords.x, coords.y, e);
                eve("raphael.drag.start." + this.id, this, coords.x, coords.y, e);
            };

            const moveHandler = (e) => {
                if (!this._drag.active) return;
                e.preventDefault();
                const coords = this.getPointerCoords(e);
                const dx = coords.x - this._drag.x;
                const dy = coords.y - this._drag.y;
                if (onmove) onmove.call(mScope || this, dx, dy, coords.x, coords.y, e);
                eve("raphael.drag.move." + this.id, this, dx, dy, coords.x, coords.y, e);
            };

            const endHandler = (e) => {
                if (!this._drag.active) return;
                this._drag.active = false;
                if (onend) onend.call(eScope || sScope || mScope || this, e);
                eve("raphael.drag.end." + this.id, this, e);
            };

            this.node.addEventListener("pointerdown", startHandler);
            window.addEventListener("pointermove", moveHandler);
            window.addEventListener("pointerup", endHandler);

            this._dragCleanup = () => {
                this.node.removeEventListener("pointerdown", startHandler);
                window.removeEventListener("pointermove", moveHandler);
                window.removeEventListener("pointerup", endHandler);
            };
            return this;
        }

        undrag() {
            if (this._dragCleanup) {
                this._dragCleanup();
                delete this._dragCleanup;
            }
            return this;
        }

        getPointerCoords(e) {
            const rect = this.paper.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        isPointInside(x, y) {
            if (this.type === "path") {
                return isPointInsidePath(this.attr("path"), x, y);
            }
            const bbox = this.getBBox();
            return isPointInsideBBox(bbox, x, y);
        }
    }

    // dynamic set proxy forwarding
    for (const name of Object.getOwnPropertyNames(RaphaelElement.prototype)) {
        if (name !== "constructor" && !Set.prototype[name]) {
            Set.prototype[name] = function(...args) {
                this.forEach(item => {
                    if (typeof item[name] === "function") {
                        item[name](...args);
                    }
                });
                return this;
            };
        }
    }

    // DOM interaction event binding for Raphael elements
    const rawEvents = ["click", "dblclick", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "touchstart", "touchmove", "touchend"];
    for (const ev of rawEvents) {
        RaphaelElement.prototype[ev] = function (fn, scope) {
            if (typeof fn === "function") {
                const handler = (e) => fn.call(scope || this, e);
                this.node.addEventListener(ev, handler);
                this.events.push({ name: ev, fn, handler });
            }
            return this;
        };
        RaphaelElement.prototype["un" + ev] = function (fn) {
            for (let i = this.events.length - 1; i >= 0; i--) {
                const e = this.events[i];
                if (e.name === ev && (!fn || e.fn === fn)) {
                    this.node.removeEventListener(ev, e.handler);
                    this.events.splice(i, 1);
                }
            }
            return this;
        };
    }

    // legacy support for text element updates
    function updateTextElement(rEl) {
        const node = rEl.node;
        const attrs = rEl.attrs;
        
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }

        const textStr = String(attrs.text || "");
        const lines = textStr.split("\n");
        const tspans = [];

        const fontSize = parseFloat(attrs["font-size"]) || 10;
        const x = attrs.x !== undefined ? parseFloat(attrs.x) : 0;
        const y = attrs.y !== undefined ? parseFloat(attrs.y) : 0;

        node.setAttribute("x", x);
        node.setAttribute("y", y);

        for (let i = 0; i < lines.length; i++) {
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            tspan.textContent = lines[i];
            if (i > 0) {
                tspan.setAttribute("dy", (1.2 * fontSize) + "px");
                tspan.setAttribute("x", x);
            }
            node.appendChild(tspan);
            tspans.push(tspan);
        }

        try {
            const wasHidden = node.style.display === "none";
            if (wasHidden) node.style.display = "";
            const bbox = node.getBBox();
            if (wasHidden) node.style.display = "none";

            const dy = y - (bbox.y + bbox.height / 2);
            if (isFinite(dy) && tspans.length > 0) {
                tspans[0].setAttribute("dy", dy + "px");
            }
        } catch (e) {
            if (tspans.length > 0) {
                tspans[0].setAttribute("dy", (fontSize * 0.3) + "px");
            }
        }
    }

    // animation queue tick controller
    const activeAnimations = [];
    let animFrameRequested = false;

    const EASING_FORMULAS = {
        linear: t => t,
        "<": t => Math.pow(t, 1.7),
        ">": t => Math.pow(t, 0.48),
        "<>": t => {
            const e = 0.48 - t / 1.04;
            const r = Math.sqrt(0.1734 + e * e);
            const t1 = r - e; const t2 = -r - e;
            const val = Math.pow(Math.abs(t1), 1 / 3) * (t1 < 0 ? -1 : 1) +
                        Math.pow(Math.abs(t2), 1 / 3) * (t2 < 0 ? -1 : 1) + 0.5;
            return 3 * (1 - val) * val * val + val * val * val;
        },
        backIn: t => t * t * (2.70158 * t - 1.70158),
        backOut: t => --t * t * (2.70158 * t + 1.70158) + 1,
        elastic: t => t === !!t ? t : Math.pow(2, -10 * t) * Math.sin(((t - 0.075) * 2 * Math.PI) / 0.3) + 1,
        bounce: t => {
            const s = 7.5625; const r = 2.75;
            if (t < 1 / r) return s * t * t;
            if (t < 2 / r) return s * (t -= 1.5 / r) * t + 0.75;
            if (t < 2.5 / r) return s * (t -= 2.25 / r) * t + 0.9375;
            return s * (t -= 2.625 / r) * t + 0.984375;
        }
    };
    EASING_FORMULAS.easeIn = EASING_FORMULAS["ease-in"] = EASING_FORMULAS["<"];
    EASING_FORMULAS.easeOut = EASING_FORMULAS["ease-out"] = EASING_FORMULAS[">"];
    EASING_FORMULAS.easeInOut = EASING_FORMULAS["ease-in-out"] = EASING_FORMULAS["<>"];

    function animationTick() {
        const now = Date.now();
        for (let i = 0; i < activeAnimations.length; i++) {
            const anim = activeAnimations[i];
            if (anim.el.removed || anim.paused) continue;

            const elapsed = now - anim.start;
            const progress = Math.min(elapsed / anim.ms, 1);
            const eased = anim.easing(progress);

            const currentAttrs = {};
            for (const prop of Object.keys(anim.from)) {
                currentAttrs[prop] = interpolate(anim.from[prop], anim.to[prop], eased, prop);
            }

            anim.el.attr(currentAttrs);
            eve("raphael.anim.frame." + anim.el.id, anim.el, progress);

            if (progress === 1) {
                eve("raphael.anim.finish." + anim.el.id, anim.el);
                if (typeof anim.callback === "function") {
                    anim.callback.call(anim.el);
                }
                activeAnimations.splice(i--, 1);
            }
        }

        if (activeAnimations.length > 0) {
            requestAnimationFrame(animationTick);
        } else {
            animFrameRequested = false;
        }
    }

    function interpolate(from, to, t, prop) {
        if (typeof from === "number" && typeof to === "number") {
            return from + (to - from) * t;
        }
        if (prop === "fill" || prop === "stroke") {
            const cFrom = getRGB(from);
            const cTo = getRGB(to);
            if (!cFrom.error && !cTo.error) {
                const r = Math.round(cFrom.r + (cTo.r - cFrom.r) * t);
                const g = Math.round(cFrom.g + (cTo.g - cFrom.g) * t);
                const b = Math.round(cFrom.b + (cTo.b - cFrom.b) * t);
                return rgbToHex(r, g, b);
            }
        }
        if (prop === "path") {
            const resPath = [];
            for (let i = 0; i < from.length; i++) {
                const startSeg = from[i];
                const endSeg = to[i];
                const resSeg = [startSeg[0]];
                for (let j = 1; j < startSeg.length; j++) {
                    resSeg.push(startSeg[j] + (endSeg[j] - startSeg[j]) * t);
                }
                resPath.push(resSeg);
            }
            resPath.toString = pathToString;
            return resPath;
        }
        return t < 0.5 ? from : to;
    }

    RaphaelElement.prototype.animate = function (toAttrs, ms, easingStr, callback) {
        if (this.removed) return this;
        
        this.stop();

        const fromAttrs = {};
        const parsedTo = {};

        const easingFn = EASING_FORMULAS[easingStr] || EASING_FORMULAS.linear;

        for (const k of Object.keys(toAttrs)) {
            if (k === "path") {
                const equalized = path2curve(this.attr("path"), toAttrs[k]);
                fromAttrs[k] = equalized[0];
                parsedTo[k] = equalized[1];
            } else {
                fromAttrs[k] = this.attr(k);
                parsedTo[k] = toAttrs[k];
            }
        }

        activeAnimations.push({
            el: this,
            from: fromAttrs,
            to: parsedTo,
            start: Date.now(),
            ms: ms || 1000,
            easing: easingFn,
            callback: callback,
            paused: false
        });

        if (!animFrameRequested) {
            animFrameRequested = true;
            requestAnimationFrame(animationTick);
        }
        return this;
    };

    RaphaelElement.prototype.stop = function () {
        for (let i = activeAnimations.length - 1; i >= 0; i--) {
            if (activeAnimations[i].el === this) {
                activeAnimations.splice(i, 1);
            }
        }
        return this;
    };

    RaphaelElement.prototype.pause = function () {
        for (const anim of activeAnimations) {
            if (anim.el === this) anim.paused = true;
        }
        return this;
    };

    RaphaelElement.prototype.resume = function () {
        for (const anim of activeAnimations) {
            if (anim.el === this) {
                anim.paused = false;
                anim.start = Date.now() - (anim.progress || 0) * anim.ms;
            }
        }
        return this;
    };

    // Paper class representing the drawing surface
    class Paper {
        constructor(container, width, height) {
            this.container = typeof container === "string" ? document.getElementById(container) : container;
            if (!this.container && container && container.jquery) {
                this.container = container.get(0);
            }
            this.width = width || 512;
            this.height = height || 342;
            this.customAttributes = {};

            this.canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            this.canvas.setAttribute("width", this.width);
            this.canvas.setAttribute("height", this.height);
            this.canvas.style.overflow = "hidden";

            this.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            this.canvas.appendChild(this.defs);
            if (this.container) {
                this.container.appendChild(this.canvas);
            }
        }

        safari() {}

        circle(cx, cy, r) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            el.setAttribute("cx", cx);
            el.setAttribute("cy", cy);
            el.setAttribute("r", r);
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "circle";
            rEl.attr({ fill: "none", stroke: "#000" });
            return rEl;
        }

        rect(x, y, w, h, rx = 0) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            el.setAttribute("x", x);
            el.setAttribute("y", y);
            el.setAttribute("width", w);
            el.setAttribute("height", h);
            if (rx) {
                el.setAttribute("rx", rx);
                el.setAttribute("ry", rx);
            }
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "rect";
            rEl.attr({ fill: "none", stroke: "#000" });
            return rEl;
        }

        ellipse(cx, cy, rx, ry) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
            el.setAttribute("cx", cx);
            el.setAttribute("cy", cy);
            el.setAttribute("rx", rx);
            el.setAttribute("ry", ry);
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "ellipse";
            rEl.attr({ fill: "none", stroke: "#000" });
            return rEl;
        }

        path(pathString) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "path";
            rEl.attr({ fill: "none", stroke: "#000", path: pathString });
            return rEl;
        }

        image(src, x, y, w, h) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "image");
            el.setAttributeNS("http://www.w3.org/1999/xlink", "href", src);
            el.setAttribute("x", x);
            el.setAttribute("y", y);
            el.setAttribute("width", w);
            el.setAttribute("height", h);
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "image";
            return rEl;
        }

        text(x, y, textStr) {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
            this.canvas.appendChild(el);
            const rEl = new RaphaelElement(el, this);
            rEl.type = "text";
            rEl.attrs = {
                x: x || 0,
                y: y || 0,
                text: textStr || "",
                fill: "#000",
                stroke: "none",
                "font-family": AVAILABLE_ATTRS["font-family"],
                "font-size": AVAILABLE_ATTRS["font-size"]
            };
            
            el.setAttribute("fill", "#000");
            el.setAttribute("stroke", "none");
            el.setAttribute("text-anchor", "middle");
            el.setAttribute("font-family", rEl.attrs["font-family"]);
            el.setAttribute("font-size", rEl.attrs["font-size"] + "px");

            updateTextElement(rEl);
            return rEl;
        }

        set() {
            return new Set();
        }

        clear() {
            eve("raphael.clear", this);
            const kids = Array.from(this.canvas.childNodes);
            for (const child of kids) {
                if (child !== this.defs) {
                    this.canvas.removeChild(child);
                }
            }
        }

        setSize(w, h) {
            this.width = w; this.height = h;
            this.canvas.setAttribute("width", w);
            this.canvas.setAttribute("height", h);
            return this;
        }

        setViewBox(x, y, w, h, fit) {
            eve("raphael.setViewBox", this, this._viewBox, [x, y, w, h, fit]);
            const viewString = x === null ? `0 0 ${this.width} ${this.height}` : `${x} ${y} ${w} ${h}`;
            this.canvas.setAttribute("viewBox", viewString);
            this.canvas.setAttribute("preserveAspectRatio", fit ? "xMidYMid meet" : "xMinYMin");
            this._viewBox = [x, y, w, h, !!fit];
            return this;
        }
    }

    // convenience function to create a new Paper instance
    function Raphael(...args) {
        return new Paper(...args);
    }

    Raphael.fn = Paper.prototype;
    Raphael.prototype = Paper.prototype;

    Raphael.ca = Raphael.customAttributes = {};

    Raphael.matrix = function(a, b, c, d, e, f) {
        return new Matrix(a, b, c, d, e, f);
    };

    Raphael.createUUID = function() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }).toUpperCase();
    };

    Raphael.parsePathString = parsePathString;
    
    Raphael.parseTransformString = function(str) {
        if (!str) return [];
        const out = [];
        str.replace(/([t s r m])\s*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\s,]*)+)/gi, (m, cmd, args) => {
            const vals = [];
            args.replace(numberRegex, (numMatch, num) => {
                if (num) vals.push(parseFloat(num));
            });
            out.push([cmd, ...vals]);
        });
        return out;
    };

    Raphael.hsb2rgb = hsb2rgb;
    Raphael.hsl2rgb = hsl2rgb;
    Raphael.getRGB = getRGB;

    Raphael.pathBBox = pathBBox;
    Raphael.bezierBBox = bezierBBox;
    Raphael.findDotsAtSegment = findDotsAtSegment;
    Raphael.pathIntersection = pathIntersection;
    Raphael.isPointInsidePath = isPointInsidePath;
    Raphael.isPointInsideBBox = isPointInsideBBox;
    Raphael.isBBoxIntersect = isBBoxIntersect;
    Raphael.pathToAbsolute = pathToAbsolute;
    Raphael.pathToRelative = pathToRelative;
    Raphael.path2curve = path2curve;

    Raphael.eve = eve;
    Raphael.el = RaphaelElement.prototype;
    Raphael.st = Set.prototype;

    return Raphael;
});