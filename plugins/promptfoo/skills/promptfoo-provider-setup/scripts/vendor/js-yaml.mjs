/*! js-yaml 5.3.0 https://github.com/nodeca/js-yaml @license MIT */
//#region src/tag.ts
var e = Symbol("NOT_RESOLVED");
function t(e, t) {
	var n, r, i, a, o;
	return {
		tagName: e,
		nodeKind: "scalar",
		implicit: (n = t.implicit) == null ? !1 : n,
		matchByTagPrefix: (r = t.matchByTagPrefix) == null ? !1 : r,
		implicitFirstChars: (i = t.implicitFirstChars) == null ? null : i,
		resolve: t.resolve,
		identify: t.identify,
		represent: (a = t.represent) == null ? ((e) => String(e)) : a,
		representTagName: (o = t.representTagName) == null ? (() => e) : o
	};
}
function n(e, t) {
	var n, r, i, a;
	let o = t.finalize === void 0;
	return {
		tagName: e,
		nodeKind: "sequence",
		implicit: !1,
		matchByTagPrefix: (n = t.matchByTagPrefix) == null ? !1 : n,
		create: t.create,
		addItem: t.addItem,
		finalize: (r = t.finalize) == null ? ((e) => e) : r,
		carrierIsResult: o,
		identify: t.identify,
		represent: (i = t.represent) == null ? ((e) => e) : i,
		representTagName: (a = t.representTagName) == null ? (() => e) : a
	};
}
function r(e, t) {
	var n, r, i, a;
	let o = t.finalize === void 0;
	return {
		tagName: e,
		nodeKind: "mapping",
		implicit: !1,
		matchByTagPrefix: (n = t.matchByTagPrefix) == null ? !1 : n,
		create: t.create,
		addPair: t.addPair,
		has: t.has,
		keys: t.keys,
		get: t.get,
		finalize: (r = t.finalize) == null ? ((e) => e) : r,
		carrierIsResult: o,
		identify: t.identify,
		represent: (i = t.represent) == null ? ((e) => e) : i,
		representTagName: (a = t.representTagName) == null ? (() => e) : a
	};
}
//#endregion
//#region src/tag/scalar/str.ts
var i = t("tag:yaml.org,2002:str", {
	resolve: (e) => e,
	identify: (e) => typeof e == "string"
}), a = [
	"",
	"~",
	"null",
	"Null",
	"NULL"
], o = t("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: [
		"",
		"~",
		"n",
		"N"
	],
	resolve: (t) => a.indexOf(t) === -1 ? e : null,
	identify: (e) => e === null,
	represent: () => "null"
}), s = t("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: ["n"],
	resolve: (t, n) => t === "null" || n && t === "" ? null : e,
	identify: (e) => e === null,
	represent: () => "null"
}), c = [
	"",
	"~",
	"null",
	"Null",
	"NULL"
], l = t("tag:yaml.org,2002:null", {
	implicit: !0,
	implicitFirstChars: [
		"",
		"~",
		"n",
		"N"
	],
	resolve: (t) => c.indexOf(t) === -1 ? e : null,
	identify: (e) => e === null,
	represent: () => "null"
}), u = [
	"true",
	"True",
	"TRUE"
], d = [
	"false",
	"False",
	"FALSE"
], f = t("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: [
		"t",
		"T",
		"f",
		"F"
	],
	resolve: (t) => u.indexOf(t) === -1 ? d.indexOf(t) === -1 ? e : !1 : !0,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), p = ["true"], m = ["false"], h = t("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: ["t", "f"],
	resolve: (t) => p.indexOf(t) === -1 ? m.indexOf(t) === -1 ? e : !1 : !0,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), ee = [
	"true",
	"True",
	"TRUE",
	"y",
	"Y",
	"yes",
	"Yes",
	"YES",
	"on",
	"On",
	"ON"
], te = [
	"false",
	"False",
	"FALSE",
	"n",
	"N",
	"no",
	"No",
	"NO",
	"off",
	"Off",
	"OFF"
], ne = t("tag:yaml.org,2002:bool", {
	implicit: !0,
	implicitFirstChars: [
		"y",
		"Y",
		"n",
		"N",
		"t",
		"T",
		"f",
		"F",
		"o",
		"O"
	],
	resolve: (t) => ee.indexOf(t) === -1 ? te.indexOf(t) === -1 ? e : !1 : !0,
	identify: (e) => Object.prototype.toString.call(e) === "[object Boolean]",
	represent: (e) => e ? "true" : "false"
}), re = /* @__PURE__ */ RegExp("^(?:0o[0-7]+|0x[0-9a-fA-F]+|[-+]?[0-9]+)$"), ie = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function ae(e) {
	let t = e, n = 1;
	return (t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b") ? n * parseInt(t.slice(2), 2) : t.startsWith("0o") ? n * parseInt(t.slice(2), 8) : t.startsWith("0x") ? n * parseInt(t.slice(2), 16) : n * parseInt(t, 10);
}
function oe(t, n) {
	if (n) {
		if (!ie.test(t)) return e;
	} else if (!re.test(t)) return e;
	let r = ae(t);
	return Number.isFinite(r) ? r : e;
}
var se = t("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		..."0123456789"
	],
	resolve: oe,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), ce = /* @__PURE__ */ RegExp("^-?(?:0|[1-9][0-9]*)$"), le = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1]+|[-+]?0o[0-7]+|[-+]?0x[0-9a-fA-F]+|[-+]?[0-9]+)$");
function ue(e) {
	let t = e, n = 1;
	return (t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b") ? n * parseInt(t.slice(2), 2) : t.startsWith("0o") ? n * parseInt(t.slice(2), 8) : t.startsWith("0x") ? n * parseInt(t.slice(2), 16) : n * parseInt(t, 10);
}
function de(t, n) {
	if (n) {
		if (!le.test(t)) return e;
	} else if (!ce.test(t)) return e;
	let r = ue(t);
	return Number.isFinite(r) ? r : e;
}
var fe = t("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: ["-", ..."0123456789"],
	resolve: de,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), pe = /* @__PURE__ */ RegExp("^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+|[-+]?(?:0|[1-9][0-9_]*))$");
function me(e) {
	let t = e.replace(/_/g, ""), n = 1;
	if ((t[0] === "-" || t[0] === "+") && (t[0] === "-" && (n = -1), t = t.slice(1)), t.startsWith("0b")) return n * parseInt(t.slice(2), 2);
	if (t.startsWith("0x")) return n * parseInt(t.slice(2), 16);
	if (t.includes(":")) {
		let e = 0;
		for (let n of t.split(":")) e = e * 60 + Number(n);
		return n * e;
	}
	return t !== "0" && t[0] === "0" ? n * parseInt(t, 8) : n * parseInt(t, 10);
}
function he(t) {
	if (!pe.test(t)) return e;
	let n = me(t);
	return Number.isFinite(n) ? n : e;
}
var ge = t("tag:yaml.org,2002:int", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		..."0123456789"
	],
	resolve: he,
	identify: (e) => Number.isInteger(e) && !Object.is(e, -0) && e.toString(10).indexOf("e") < 0,
	represent: (e) => e.toString(10)
}), _e = /* @__PURE__ */ RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), ve = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function ye(t) {
	if (!_e.test(t)) return e;
	let n = t.toLowerCase(), r = n[0] === "-" ? -1 : 1;
	if ("+-".includes(n[0]) && (n = n.slice(1)), n === ".inf") return r === 1 ? Infinity : -Infinity;
	if (n === ".nan") return NaN;
	let i = r * parseFloat(n);
	return Number.isFinite(i) || ve.test(t) ? i : e;
}
function be(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var xe = t("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		".",
		..."0123456789"
	],
	resolve: ye,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: be
}), Se = /* @__PURE__ */ RegExp("^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$"), Ce = /* @__PURE__ */ RegExp("^(?:[-+]?[0-9]+(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function we(t, n) {
	if (n) {
		if (!Ce.test(t)) return e;
		let n = t.toLowerCase(), r = n[0] === "-" ? -1 : 1;
		if ("+-".includes(n[0]) && (n = n.slice(1)), n === ".inf") return r === 1 ? Infinity : -Infinity;
		if (n === ".nan") return NaN;
		let i = r * parseFloat(n);
		return Number.isFinite(i) ? i : e;
	}
	if (!Se.test(t)) return e;
	let r = Number(t);
	return Number.isFinite(r) ? r : e;
}
function Te(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var Ee = t("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: ["-", ..."0123456789"],
	resolve: we,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: Te
}), De = /* @__PURE__ */ RegExp("^(?:[-+]?(?:(?:[0-9][0-9_]*)?\\.[0-9_]*)(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"), Oe = /* @__PURE__ */ RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function ke(t) {
	if (!De.test(t)) return e;
	let n = t.toLowerCase().replace(/_/g, ""), r = n[0] === "-" ? -1 : 1;
	if ("+-".includes(n[0]) && (n = n.slice(1)), n === ".inf") return r === 1 ? Infinity : -Infinity;
	if (n === ".nan") return NaN;
	let i = 0;
	if (n.includes(":")) {
		for (let e of n.split(":")) i = i * 60 + Number(e);
		i *= r;
	} else i = r * parseFloat(n);
	return Number.isFinite(i) || Oe.test(t) ? i : e;
}
function Ae(e) {
	if (isNaN(e)) return ".nan";
	if (e === Infinity) return ".inf";
	if (e === -Infinity) return "-.inf";
	if (Object.is(e, -0)) return "-0.0";
	let t = e.toString(10);
	return /^[-+]?[0-9]+e/.test(t) ? t.replace("e", ".e") : t;
}
var je = t("tag:yaml.org,2002:float", {
	implicit: !0,
	implicitFirstChars: [
		"-",
		"+",
		".",
		..."0123456789"
	],
	resolve: ke,
	identify: (e) => typeof e == "number" && (!Number.isInteger(e) || Object.is(e, -0) || e.toString(10).indexOf("e") >= 0),
	represent: Ae
}), Me = t("tag:yaml.org,2002:merge", {
	implicit: !0,
	implicitFirstChars: ["<"],
	resolve: (t, n) => t === "<<" || n && t === "" ? "<<" : e,
	identify: () => !1
}), Ne = /^[A-Za-z0-9+/]*={0,2}$/;
function Pe(t) {
	let n = t.replace(/\s/g, "");
	if (n.length % 4 != 0 || !Ne.test(n)) return e;
	let r = atob(n), i = new Uint8Array(r.length);
	for (let e = 0; e < r.length; e++) i[e] = r.charCodeAt(e);
	return i;
}
function Fe(e) {
	let t = "";
	for (let n = 0; n < e.length; n++) t += String.fromCharCode(e[n]);
	return btoa(t);
}
var Ie = t("tag:yaml.org,2002:binary", {
	resolve: Pe,
	identify: (e) => Object.prototype.toString.call(e) === "[object Uint8Array]",
	represent: Fe
}), Le = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"), Re = /* @__PURE__ */ RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
function ze(e, t, n, r = 0, i = 0, a = 0, o = 0) {
	let s = new Date(Date.UTC(e, t, n, r, i, a, o));
	return s.setUTCFullYear(e, t, n), s;
}
function Be(t) {
	let n = Le.exec(t);
	if (n === null && (n = Re.exec(t)), n === null) return e;
	let r = +n[1], i = n[2] - 1, a = +n[3];
	if (!n[4]) {
		let t = ze(r, i, a);
		return t.getUTCFullYear() !== r || t.getUTCMonth() !== i || t.getUTCDate() !== a ? e : t;
	}
	let o = +n[4], s = +n[5], c = +n[6], l = 0;
	if (o > 23 || s > 59 || c > 59) return e;
	if (n[7]) {
		let e = n[7].slice(0, 3);
		for (; e.length < 3;) e += "0";
		l = +e;
	}
	let u = ze(r, i, a, o, s, c, l);
	if (u.getUTCFullYear() !== r || u.getUTCMonth() !== i || u.getUTCDate() !== a) return e;
	if (n[9]) {
		let t = +n[10], r = +(n[11] || 0);
		if (t > 23 || r > 59) return e;
		let i = (t * 60 + r) * 6e4;
		u.setTime(u.getTime() - (n[9] === "-" ? -i : i));
	}
	return u;
}
var Ve = t("tag:yaml.org,2002:timestamp", {
	implicit: !0,
	implicitFirstChars: [..."0123456789"],
	resolve: Be,
	identify: (e) => e instanceof Date,
	represent: (e) => e.toISOString()
}), He = n("tag:yaml.org,2002:seq", {
	create: () => [],
	addItem: (e, t) => {
		e.push(t);
	},
	identify: Array.isArray
});
//#endregion
//#region src/common/object.ts
function Ue(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) return !1;
	let t = Object.getPrototypeOf(e);
	return t === null || t === Object.prototype;
}
function We(e, t) {
	let n = {};
	for (let r of t) e[r] !== void 0 && (n[r] = e[r]);
	return n;
}
//#endregion
//#region src/tag/sequence/omap.ts
var Ge = n("tag:yaml.org,2002:omap", {
	create: () => ({
		list: [],
		seen: /* @__PURE__ */ new Set()
	}),
	addItem: (e, t) => {
		let n;
		if (t instanceof Map) {
			if (t.size !== 1) return "cannot resolve an ordered map item";
			n = t.keys().next().value;
		} else if (Ue(t)) {
			let e = Object.keys(t);
			if (e.length !== 1) return "cannot resolve an ordered map item";
			n = e[0];
		} else return "cannot resolve an ordered map item";
		return e.seen.has(n) ? "duplicate key in ordered map" : (e.seen.add(n), e.list.push(t), "");
	},
	finalize: (e) => e.list,
	identify: () => !1
}), Ke = n("tag:yaml.org,2002:pairs", {
	create: () => [],
	addItem: (e, t) => {
		if (t instanceof Map) return t.size === 1 ? (e.push(t.entries().next().value), "") : "cannot resolve a pairs item";
		if (Object.prototype.toString.call(t) !== "[object Object]") return "cannot resolve a pairs item";
		let n = t, r = Object.keys(n);
		return r.length === 1 ? (e.push([r[0], n[r[0]]]), "") : "cannot resolve a pairs item";
	},
	identify: () => !1
}), qe = r("tag:yaml.org,2002:map", {
	create: () => ({}),
	identify: Ue,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of Object.keys(e)) t.set(n, e[n]);
		return t;
	},
	addPair: (e, t, n) => {
		if (typeof t == "object" && t) return "object-based map does not support complex keys";
		let r = String(t);
		return r === "__proto__" ? Object.defineProperty(e, r, {
			value: n,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = n, "";
	},
	has: (e, t) => typeof t == "object" && t ? !1 : Object.prototype.hasOwnProperty.call(e, String(t)),
	keys: (e) => Object.keys(e),
	get: (e, t) => {
		let n = String(t);
		return Object.prototype.hasOwnProperty.call(e, n) ? e[n] : null;
	}
}), Je = r("tag:yaml.org,2002:set", {
	create: () => /* @__PURE__ */ new Set(),
	identify: (e) => e instanceof Set,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) t.set(n, null);
		return t;
	},
	addPair: (e, t, n) => n === null ? (e.add(t), "") : "cannot resolve a set item",
	has: (e, t) => e.has(t),
	keys: (e) => e.keys(),
	get: () => null
});
//#endregion
//#region \0@oxc-project+runtime@0.137.0/helpers/esm/typeof.js
function g(e) {
	"@babel/helpers - typeof";
	return g = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, g(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.137.0/helpers/esm/toPrimitive.js
function Ye(e, t) {
	if (g(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (g(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.137.0/helpers/esm/toPropertyKey.js
function Xe(e) {
	var t = Ye(e, "string");
	return g(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.137.0/helpers/esm/defineProperty.js
function _(e, t, n) {
	return (t = Xe(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region \0@oxc-project+runtime@0.137.0/helpers/esm/objectSpread2.js
function Ze(e, t) {
	var n = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var r = Object.getOwnPropertySymbols(e);
		t && (r = r.filter(function(t) {
			return Object.getOwnPropertyDescriptor(e, t).enumerable;
		})), n.push.apply(n, r);
	}
	return n;
}
function v(e) {
	for (var t = 1; t < arguments.length; t++) {
		var n = arguments[t] == null ? {} : arguments[t];
		t % 2 ? Ze(Object(n), !0).forEach(function(t) {
			_(e, t, n[t]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n)) : Ze(Object(n)).forEach(function(t) {
			Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
		});
	}
	return e;
}
//#endregion
//#region src/schema.ts
function Qe() {
	return {
		scalar: Object.create(null),
		sequence: Object.create(null),
		mapping: Object.create(null)
	};
}
function $e() {
	return {
		scalar: [],
		sequence: [],
		mapping: []
	};
}
function et(e) {
	let t = [];
	for (let n of e) {
		let e = t.length;
		for (let r = 0; r < t.length; r++) {
			let i = t[r];
			if (i.nodeKind === n.nodeKind && i.tagName === n.tagName && i.matchByTagPrefix === n.matchByTagPrefix) {
				e = r;
				break;
			}
		}
		t[e] = n;
	}
	return t;
}
var y = class t {
	constructor(e) {
		_(this, "tags", void 0), _(this, "implicitScalarTags", void 0), _(this, "implicitScalarByFirstChar", void 0), _(this, "implicitScalarAnyFirstChar", void 0), _(this, "defaultScalarTag", void 0), _(this, "defaultSequenceTag", void 0), _(this, "defaultMappingTag", void 0), _(this, "exact", void 0), _(this, "prefix", void 0);
		let t = et(e), n = [], r = Qe(), i = $e();
		for (let e of t) {
			if (e.nodeKind === "scalar" && e.implicit) {
				if (e.matchByTagPrefix) throw Error("Implicit scalar tags cannot match by tag prefix");
				n.push(e);
			}
			switch (e.nodeKind) {
				case "scalar":
					e.matchByTagPrefix ? i.scalar.push(e) : r.scalar[e.tagName] = e;
					break;
				case "sequence":
					e.matchByTagPrefix ? i.sequence.push(e) : r.sequence[e.tagName] = e;
					break;
				case "mapping":
					e.matchByTagPrefix ? i.mapping.push(e) : r.mapping[e.tagName] = e;
					break;
			}
		}
		let a = n.filter((e) => e.implicitFirstChars === null), o = /* @__PURE__ */ new Set();
		for (let e of n) if (e.implicitFirstChars !== null) for (let t of e.implicitFirstChars) o.add(t);
		let s = /* @__PURE__ */ new Map();
		for (let e of o) s.set(e, n.filter((t) => t.implicitFirstChars === null || t.implicitFirstChars.indexOf(e) !== -1));
		let c = r.scalar["tag:yaml.org,2002:str"];
		if (!c) throw Error("schema does not define the default scalar tag (tag:yaml.org,2002:str)");
		this.tags = t, this.implicitScalarTags = n, this.implicitScalarByFirstChar = s, this.implicitScalarAnyFirstChar = a, this.defaultScalarTag = c, this.defaultSequenceTag = r.sequence["tag:yaml.org,2002:seq"], this.defaultMappingTag = r.mapping["tag:yaml.org,2002:map"], this.exact = r, this.prefix = i;
	}
	lookupScalarTag(e) {
		let t = this.exact.scalar[e];
		if (t) return t;
		for (let t of this.prefix.scalar) if (e.startsWith(t.tagName)) return t;
	}
	lookupSequenceTag(e) {
		let t = this.exact.sequence[e];
		if (t) return t;
		for (let t of this.prefix.sequence) if (e.startsWith(t.tagName)) return t;
	}
	lookupMappingTag(e) {
		let t = this.exact.mapping[e];
		if (t) return t;
		for (let t of this.prefix.mapping) if (e.startsWith(t.tagName)) return t;
	}
	resolveImplicitScalarTag(t) {
		var n;
		let r = (n = this.implicitScalarByFirstChar.get(t.charAt(0))) == null ? this.implicitScalarAnyFirstChar : n;
		for (let n of r) {
			let r = n.resolve(t, !1, n.tagName);
			if (r !== e) return {
				value: r,
				tag: n
			};
		}
		let i = this.defaultScalarTag;
		return {
			value: i.resolve(t, !1, i.tagName),
			tag: i
		};
	}
	withTags(...e) {
		let n = [];
		for (let t of e) n = n.concat(t);
		return new t([...this.tags, ...n]);
	}
}, tt = new y([
	i,
	He,
	qe
]), nt = new y([
	...tt.tags,
	s,
	h,
	fe,
	Ee
]), rt = new y([
	...tt.tags,
	o,
	f,
	se,
	xe
]), it = new y([
	...tt.tags,
	l,
	ne,
	ge,
	je,
	Ve,
	Me,
	Ie,
	Ge,
	Ke,
	Je
]), at = it.withTags(v(v({}, ge), {}, { resolve: (t, n, r) => {
	let i = ge.resolve(t, n, r);
	return i === e ? se.resolve(t, n, r) : i;
} }), v(v({}, je), {}, { resolve: (t, n, r) => {
	let i = je.resolve(t, n, r);
	return i === e ? xe.resolve(t, n, r) : i;
} })), ot = r("tag:yaml.org,2002:map", {
	create: () => /* @__PURE__ */ new Map(),
	addPair: (e, t, n) => (e.set(t, n), ""),
	has: (e, t) => e.has(t),
	keys: (e) => e.keys(),
	get: (e, t) => e.get(t),
	identify: (e) => e instanceof Map || Ue(e),
	represent: (e) => {
		if (e instanceof Map) return e;
		let t = /* @__PURE__ */ new Map(), n = e;
		for (let e of Object.keys(n)) t.set(e, n[e]);
		return t;
	}
});
//#endregion
//#region src/tag/mapping/legacy_map.ts
function st(e) {
	if (Array.isArray(e)) {
		let t = Array.prototype.slice.call(e);
		for (let e = 0; e < t.length; e++) {
			if (Array.isArray(t[e])) return null;
			typeof t[e] == "object" && Object.prototype.toString.call(t[e]) === "[object Object]" && (t[e] = "[object Object]");
		}
		return String(t);
	}
	return typeof e == "object" && Object.prototype.toString.call(e) === "[object Object]" ? "[object Object]" : String(e);
}
var ct = r("tag:yaml.org,2002:map", {
	create: () => ({}),
	identify: Ue,
	represent: (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of Object.keys(e)) t.set(n, e[n]);
		return t;
	},
	addPair: (e, t, n) => {
		let r = st(t);
		return r === null ? "nested arrays are not supported inside keys" : (r === "__proto__" ? Object.defineProperty(e, r, {
			value: n,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = n, "");
	},
	has: (e, t) => {
		let n = st(t);
		return n !== null && Object.prototype.hasOwnProperty.call(e, n);
	},
	keys: (e) => Object.keys(e),
	get: (e, t) => {
		let n = String(t);
		return Object.prototype.hasOwnProperty.call(e, n) ? e[n] : null;
	}
}), lt = {
	maxLength: 79,
	indent: 1,
	linesBefore: 3,
	linesAfter: 2
};
function ut(e, t, n, r, i) {
	let a = "", o = "", s = Math.floor(i / 2) - 1;
	return r - t > s && (a = " ... ", t = r - s + a.length), n - r > s && (o = " ...", n = r + s - o.length), {
		str: a + e.slice(t, n).replace(/\t/g, "→") + o,
		pos: r - t + a.length
	};
}
function dt(e, t) {
	return " ".repeat(Math.max(t - e.length, 0)) + e;
}
function ft(e, t) {
	if (!e.buffer) return null;
	let n = v(v({}, lt), t), r = /\r?\n|\r|\0/g, i = [0], a = [], o, s = -1;
	for (; o = r.exec(e.buffer);) a.push(o.index), i.push(o.index + o[0].length), e.position <= o.index && s < 0 && (s = i.length - 2);
	s < 0 && (s = i.length - 1);
	let c = "", l = Math.min(e.line + n.linesAfter, a.length).toString().length, u = n.maxLength - (n.indent + l + 3);
	for (let t = 1; t <= n.linesBefore && !(s - t < 0); t++) {
		let r = ut(e.buffer, i[s - t], a[s - t], e.position - (i[s] - i[s - t]), u);
		c = `${" ".repeat(n.indent)}${dt((e.line - t + 1).toString(), l)} | ${r.str}\n${c}`;
	}
	let d = ut(e.buffer, i[s], a[s], e.position, u);
	c += `${" ".repeat(n.indent)}${dt((e.line + 1).toString(), l)} | ${d.str}\n`, c += `${"-".repeat(n.indent + l + 3 + d.pos)}^\n`;
	for (let t = 1; t <= n.linesAfter && !(s + t >= a.length); t++) {
		let r = ut(e.buffer, i[s + t], a[s + t], e.position - (i[s] - i[s + t]), u);
		c += `${" ".repeat(n.indent)}${dt((e.line + t + 1).toString(), l)} | ${r.str}\n`;
	}
	return c.replace(/\n$/, "");
}
//#endregion
//#region src/common/exception.ts
function pt(e, t) {
	let n = "";
	return e.mark ? (e.mark.name && (n += `in "${e.mark.name}" `), n += `(${e.mark.line + 1}:${e.mark.column + 1})`, !t && e.mark.snippet && (n += `\n\n${e.mark.snippet}`), `${e.reason} ${n}`) : e.reason;
}
var b = class e extends Error {
	constructor(e, t) {
		super(), _(this, "reason", void 0), _(this, "mark", void 0), this.name = "YAMLException", this.reason = e, this.mark = t, this.message = pt(this, !1), Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
	}
	toString(e) {
		return `${this.name}: ${pt(this, e)}`;
	}
	static throwAt(t, n, r, i = "") {
		let a = 0, o = 0;
		for (let e = 0; e < n; e++) {
			let n = t.charCodeAt(e);
			n === 10 ? (a++, o = e + 1) : n === 13 && (a++, t.charCodeAt(e + 1) === 10 && e++, o = e + 1);
		}
		let s = {
			name: i,
			buffer: t,
			position: n,
			line: a,
			column: n - o
		};
		throw s.snippet = ft(s), new e(r, s);
	}
}, x = {
	DOCUMENT: 1,
	SEQUENCE: 2,
	MAPPING: 3,
	SCALAR: 4,
	ALIAS: 5,
	POP: 6
}, S = {
	PLAIN: 1,
	SINGLE_QUOTED: 2,
	DOUBLE_QUOTED: 3,
	LITERAL_BLOCK: 4,
	FOLDED_BLOCK: 5
}, C = {
	BLOCK: 1,
	FLOW: 2
}, w = {
	CLIP: 1,
	STRIP: 2,
	KEEP: 3
}, mt = -1;
function ht(e) {
	switch (e) {
		case 48: return "\0";
		case 97: return "\x07";
		case 98: return "\b";
		case 116: return "	";
		case 9: return "	";
		case 110: return "\n";
		case 118: return "\v";
		case 102: return "\f";
		case 114: return "\r";
		case 101: return "\x1B";
		case 32: return " ";
		case 34: return "\"";
		case 47: return "/";
		case 92: return "\\";
		case 78: return "";
		case 95: return "\xA0";
		case 76: return "\u2028";
		case 80: return "\u2029";
		default: return "";
	}
}
var gt = Array(256), _t = Array(256);
for (let e = 0; e < 256; e++) gt[e] = +!!ht(e), _t[e] = ht(e);
function vt(e) {
	return e <= 65535 ? String.fromCharCode(e) : String.fromCharCode((e - 65536 >> 10) + 55296, (e - 65536 & 1023) + 56320);
}
function yt(e) {
	return e >= 48 && e <= 57 ? e - 48 : (e | 32) - 97 + 10;
}
function bt(e) {
	return e === 120 ? 2 : e === 117 ? 4 : 8;
}
function xt(e, t, n) {
	let r = 0;
	for (; t < n;) {
		let n = e.charCodeAt(t);
		if (n === 10) r++, t++;
		else if (n === 13) r++, t++, e.charCodeAt(t) === 10 && t++;
		else if (n === 32 || n === 9) t++;
		else break;
	}
	return {
		position: t,
		breaks: r
	};
}
function St(e) {
	return e === 1 ? " " : "\n".repeat(e - 1);
}
function Ct(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = xt(e, i, n);
			r += St(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, o);
}
function wt(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 39) r += e.slice(a, i) + "'", i += 2, a = o = i;
		else if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = xt(e, i, n);
			r += St(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, n);
}
function Tt(e, t, n) {
	let r = "", i = t, a = t, o = t;
	for (; i < n;) {
		let t = e.charCodeAt(i);
		if (t === 92) {
			r += e.slice(a, i), i++;
			let t = e.charCodeAt(i);
			if (t === 10 || t === 13) i = xt(e, i, n).position;
			else if (t < 256 && gt[t]) r += _t[t], i++;
			else {
				let n = bt(t), a = 0;
				for (; n > 0; n--) {
					i++;
					let t = yt(e.charCodeAt(i));
					a = (a << 4) + t;
				}
				r += vt(a), i++;
			}
			a = o = i;
		} else if (t === 10 || t === 13) {
			r += e.slice(a, o);
			let t = xt(e, i, n);
			r += St(t.breaks), i = a = o = t.position;
		} else i++, t !== 32 && t !== 9 && (o = i);
	}
	return r + e.slice(a, n);
}
function Et(e, t, n, r, i, a) {
	let o = r < 0 ? 0 : r, s = e.slice(t, n).replace(/\r\n?/g, "\n"), c = s === "" ? [] : (s.endsWith("\n") ? s.slice(0, -1) : s).split("\n"), l = "", u = !1, d = 0, f = !1;
	for (let e of c) {
		let t = 0;
		for (; t < o && e.charCodeAt(t) === 32;) t++;
		if (r < 0 || t >= e.length) {
			d++;
			continue;
		}
		let n = e.slice(o), i = n.charCodeAt(0);
		a ? i === 32 || i === 9 ? (f = !0, l += "\n".repeat(u ? 1 + d : d)) : f ? (f = !1, l += "\n".repeat(d + 1)) : d === 0 ? u && (l += " ") : l += "\n".repeat(d) : l += "\n".repeat(u ? 1 + d : d), l += n, u = !0, d = 0;
	}
	return i === w.KEEP ? l += "\n".repeat(u ? 1 + d : d) : i !== w.STRIP && u && (l += "\n"), l;
}
function Dt(e, t) {
	if (t.valueStart === mt) return "";
	let { valueStart: n, valueEnd: r } = t;
	if (t.fast) return e.slice(n, r);
	switch (t.style) {
		case S.SINGLE_QUOTED: return wt(e, n, r);
		case S.DOUBLE_QUOTED: return Tt(e, n, r);
		case S.LITERAL_BLOCK: return Et(e, n, r, t.indent, t.chomping, !1);
		case S.FOLDED_BLOCK: return Et(e, n, r, t.indent, t.chomping, !0);
		default: return Ct(e, n, r);
	}
}
//#endregion
//#region src/common/tagname.ts
var Ot = Object.assign(Object.create(null), {
	"!": "!",
	"!!": "tag:yaml.org,2002:"
});
function kt(e) {
	return encodeURI(e).replace(/!/g, "%21");
}
function At(e, t) {
	var n, r;
	if (e.startsWith("!<") && e.endsWith(">")) return decodeURIComponent(e.slice(2, -1));
	let i = e.indexOf("!", 1), a = i === -1 ? "!" : e.slice(0, i + 1), o = (n = (r = t == null ? void 0 : t[a]) == null ? Ot[a] : r) == null ? a : n;
	return decodeURIComponent(o) + decodeURIComponent(e.slice(a.length));
}
function jt(e) {
	let t = e;
	return t.charCodeAt(0) === 33 ? (t = t.slice(1), `!${kt(t)}`) : t.slice(0, 18) === "tag:yaml.org,2002:" ? `!!${kt(t.slice(18))}` : `!<${kt(t)}>`;
}
//#endregion
//#region src/parser/constructor.ts
var T = -1, Mt = "tag:yaml.org,2002:merge", Nt = {
	filename: "",
	schema: rt,
	json: !1,
	maxTotalMergeKeys: 1e4,
	maxAliases: -1
};
function Pt(e) {
	return "tagStart" in e && e.tagStart !== T ? e.tagStart : "anchorStart" in e && e.anchorStart !== T ? e.anchorStart : "valueStart" in e && e.valueStart !== T ? e.valueStart : "start" in e ? e.start : 0;
}
function E(e, t) {
	b.throwAt(e.source, e.position, t, e.filename);
}
function Ft(e, t, n, r) {
	try {
		return n.finalize(r);
	} catch (n) {
		if (n instanceof b) throw n;
		b.throwAt(e.source, t, n instanceof Error ? n.message : String(n), e.filename);
	}
}
function It(t, n) {
	let r = Dt(t.source, n), i = n.tagStart === T ? "" : t.source.slice(n.tagStart, n.tagEnd), a = t.schema.defaultScalarTag;
	if (i !== "") {
		var o;
		if (i === "!") return {
			value: r,
			tag: a
		};
		let n = At(i, t.tagHandlers), s = t.schema.lookupScalarTag(n);
		if (s) {
			let i = s.resolve(r, !0, n);
			return i === e && E(t, `cannot resolve a node with !<${n}> explicit tag`), {
				value: i,
				tag: s
			};
		}
		let c = (o = t.schema.lookupMappingTag(n)) == null ? t.schema.lookupSequenceTag(n) : o;
		if (c) {
			r !== "" && E(t, `cannot resolve a node with !<${n}> explicit tag`);
			let e = c.create(n);
			return {
				value: c.carrierIsResult ? e : Ft(t, t.position, c, e),
				tag: c
			};
		}
		E(t, `unknown scalar tag !<${n}>`);
	}
	return n.style === S.PLAIN ? t.schema.resolveImplicitScalarTag(r) : {
		value: a.resolve(r, !1, a.tagName),
		tag: a
	};
}
function Lt(e, t, n) {
	let r = t.tagStart === T ? "" : e.source.slice(t.tagStart, t.tagEnd);
	return r === "" || r === "!" ? n : At(r, e.tagHandlers);
}
function Rt(e) {
	return e.nodeKind === "mapping";
}
function zt(e, t, n, r) {
	for (let a of r.keys(n)) {
		var i;
		if (e.maxTotalMergeKeys !== -1 && ++e.totalMergeKeys > e.maxTotalMergeKeys && E(e, `merge keys exceeded maxTotalMergeKeys (${e.maxTotalMergeKeys})`), t.tag.has(t.value, a)) continue;
		let o = t.tag.addPair(t.value, a, r.get(n, a));
		o && E(e, o), ((i = t.overridable) == null ? t.overridable = /* @__PURE__ */ new Set() : i).add(a);
	}
}
function Bt(e, t, n, r) {
	if (e.position = t.keyPosition, Rt(r)) zt(e, t, n, r);
	else if (r.nodeKind === "sequence" && Array.isArray(n)) for (let r of n) {
		let n = e.nodeTags.get(r);
		n || E(e, "cannot merge mappings; the provided source object is unacceptable"), zt(e, t, r, n);
	}
	else E(e, "cannot merge mappings; the provided source object is unacceptable");
}
function Vt(e, t, n, r, i) {
	var a, o;
	if (e.position = t.keyPosition, t.keyIsMerge) {
		Bt(e, t, r, i);
		return;
	}
	!e.json && t.tag.has(t.value, n) && !((a = t.overridable) != null && a.has(n)) && E(e, "duplicated mapping key");
	let s = t.tag.addPair(t.value, n, r);
	s && E(e, s), (o = t.overridable) == null || o.delete(n);
}
function Ht(e, t, n) {
	let r = e.frames[e.frames.length - 1];
	if (r.kind === "document") r.value = t, r.hasValue = !0;
	else if (r.kind === "sequence") {
		Rt(n) && e.nodeTags.set(t, n);
		let i = r.tag.addItem(r.value, t, r.index++);
		i && E(e, i);
	} else if (r.hasKey) {
		let i = r.key;
		r.key = void 0, r.hasKey = !1, Vt(e, r, i, t, n);
	} else r.key = t, r.keyPosition = e.position, r.hasKey = !0, r.keyIsMerge = n.tagName === Mt;
}
function Ut(e, t, n, r, i) {
	if (t.anchorStart !== T) {
		let a = {
			value: n,
			tag: r,
			isValueFinal: i
		};
		return e.anchors.set(e.source.slice(t.anchorStart, t.anchorEnd), a), a;
	}
	return null;
}
function Wt(e, t) {
	let n = v(v(v({}, Nt), t), {}, {
		events: e,
		documents: [],
		eventIndex: 0,
		position: 0,
		frames: [],
		anchors: /* @__PURE__ */ new Map(),
		nodeTags: /* @__PURE__ */ new Map(),
		tagHandlers: Object.create(null),
		totalMergeKeys: 0,
		aliasCount: 0
	});
	for (; n.eventIndex < n.events.length;) {
		let e = n.events[n.eventIndex++];
		switch (n.position = Pt(e), e.type) {
			case x.DOCUMENT:
				n.anchors = /* @__PURE__ */ new Map(), n.nodeTags = /* @__PURE__ */ new Map(), n.aliasCount = 0, n.tagHandlers = Object.create(null);
				for (let t of e.directives) t.kind === "tag" && (n.tagHandlers[t.handle] = t.prefix);
				n.frames.push({
					kind: "document",
					position: n.position,
					value: void 0,
					hasValue: !1
				});
				break;
			case x.SCALAR: {
				let { value: t, tag: r } = It(n, e);
				Ut(n, e, t, r, !0), Ht(n, t, r);
				break;
			}
			case x.SEQUENCE: {
				let t = Lt(n, e, "tag:yaml.org,2002:seq"), r = n.schema.lookupSequenceTag(t);
				r || E(n, `unknown sequence tag !<${t}>`);
				let i = r.create(t), a = Ut(n, e, i, r, r.carrierIsResult);
				n.frames.push({
					kind: "sequence",
					position: n.position,
					value: i,
					tag: r,
					anchor: a,
					index: 0
				});
				break;
			}
			case x.MAPPING: {
				let t = Lt(n, e, "tag:yaml.org,2002:map"), r = n.schema.lookupMappingTag(t);
				r || E(n, `unknown mapping tag !<${t}>`);
				let i = r.create(t), a = Ut(n, e, i, r, r.carrierIsResult);
				n.frames.push({
					kind: "mapping",
					position: n.position,
					value: i,
					tag: r,
					anchor: a,
					key: void 0,
					keyPosition: n.position,
					hasKey: !1,
					keyIsMerge: !1,
					overridable: null
				});
				break;
			}
			case x.ALIAS: {
				n.maxAliases !== -1 && ++n.aliasCount > n.maxAliases && E(n, `aliases exceeded maxAliases (${n.maxAliases})`);
				let t = n.source.slice(e.anchorStart, e.anchorEnd), r = n.anchors.get(t);
				r || E(n, `unidentified alias "${t}"`), r.isValueFinal || E(n, `recursive alias "${t}" is not supported for tag ${r.tag.tagName} because it uses finalize()`), Ht(n, r.value, r.tag);
				break;
			}
			case x.POP: {
				let e = n.frames.pop();
				if (e.kind === "mapping" && e.hasKey && (n.position = e.keyPosition, E(n, "incomplete mapping pair in event stream")), e.kind === "document") n.documents.push(e.value);
				else {
					let t = e.tag.carrierIsResult ? e.value : Ft(n, e.position, e.tag, e.value);
					e.anchor && (e.anchor.value = t, e.anchor.isValueFinal = !0), Ht(n, t, e.tag);
				}
				break;
			}
		}
	}
	return n.documents;
}
//#endregion
//#region src/parser/parser.ts
var D = -1, Gt = Object.prototype.hasOwnProperty, O = 1, Kt = 2, qt = 3, Jt = 4, Yt = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/, Xt = /[,\[\]{}]/, Zt = /^(?:!|!!|![0-9A-Za-z-]+!)$/, Qt = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$,_.!~*'()\[\]])`, $t = String.raw`(?:%[0-9A-Fa-f]{2}|[0-9A-Za-z\-#;/?:@&=+$.~*'()_])`, en = RegExp(`^(?:${Qt})*$`), tn = RegExp(`^(?:${$t})+$`), nn = RegExp(`^(?:!(?:${Qt})*|${$t}(?:${Qt})*)$`), rn = {
	filename: "",
	maxDepth: 100
};
function an(e, t, n) {
	e.events.push({
		type: x.DOCUMENT,
		explicitStart: t,
		explicitEnd: n,
		directives: e.directives
	});
}
function on(e, t, n, r, i, a, o) {
	e.events.push({
		type: x.SEQUENCE,
		start: t,
		anchorStart: n,
		anchorEnd: r,
		tagStart: i,
		tagEnd: a,
		style: o
	});
}
function sn(e, t, n, r, i, a, o) {
	e.events.push({
		type: x.MAPPING,
		start: t,
		anchorStart: n,
		anchorEnd: r,
		tagStart: i,
		tagEnd: a,
		style: o
	});
}
function cn(e, t) {
	e.events.splice(t.eventsLength, 0, {
		type: x.MAPPING,
		start: t.position,
		anchorStart: D,
		anchorEnd: D,
		tagStart: D,
		tagEnd: D,
		style: C.FLOW
	});
}
function k(e, t, n, r, i, a, o, s, c = w.CLIP, l = -1, u = !1) {
	e.events.push({
		type: x.SCALAR,
		valueStart: t,
		valueEnd: n,
		anchorStart: r,
		anchorEnd: i,
		tagStart: a,
		tagEnd: o,
		style: s,
		chomping: c,
		indent: l,
		fast: u
	});
}
function ln(e, t, n) {
	e.events.push({
		type: x.ALIAS,
		anchorStart: t,
		anchorEnd: n
	});
}
function A(e) {
	e.events.push({ type: x.POP });
}
function j(e) {
	k(e, D, D, D, D, D, D, S.PLAIN);
}
function un() {
	return {
		anchorStart: D,
		anchorEnd: D,
		tagStart: D,
		tagEnd: D
	};
}
function M(e) {
	return {
		position: e.position,
		line: e.line,
		lineStart: e.lineStart,
		lineIndent: e.lineIndent,
		firstTabInLine: e.firstTabInLine,
		eventsLength: e.events.length
	};
}
function N(e, t) {
	e.position = t.position, e.line = t.line, e.lineStart = t.lineStart, e.lineIndent = t.lineIndent, e.firstTabInLine = t.firstTabInLine, e.events.length = t.eventsLength;
}
function P(e, t) {
	b.throwAt(e.input.slice(0, e.length), e.position, t, e.filename);
}
function F(e) {
	return e === 10 || e === 13;
}
function I(e) {
	return e === 9 || e === 32;
}
function L(e) {
	return I(e) || F(e);
}
function R(e) {
	return e === 0 || L(e);
}
function z(e) {
	return e === 44 || e === 91 || e === 93 || e === 123 || e === 125;
}
function dn(e) {
	return e >= 48 && e <= 57 ? e - 48 : -1;
}
function fn(e) {
	if (e >= 48 && e <= 57) return e - 48;
	let t = e | 32;
	return t >= 97 && t <= 102 ? t - 97 + 10 : -1;
}
function pn(e) {
	return e === 120 ? 2 : e === 117 ? 4 : e === 85 ? 8 : 0;
}
function mn(e) {
	return e === 48 || e === 97 || e === 98 || e === 116 || e === 9 || e === 110 || e === 118 || e === 102 || e === 114 || e === 101 || e === 32 || e === 34 || e === 47 || e === 92 || e === 78 || e === 95 || e === 76 || e === 80;
}
function hn(e) {
	e.input.charCodeAt(e.position) === 10 ? e.position++ : (e.position++, e.input.charCodeAt(e.position) === 10 && e.position++), e.line++, e.lineStart = e.position, e.lineIndent = 0, e.firstTabInLine = -1;
}
function B(e, t) {
	let n = 0, r = e.input.charCodeAt(e.position), i = e.position === e.lineStart || L(e.input.charCodeAt(e.position - 1));
	for (; r !== 0;) {
		for (; I(r);) i = !0, r === 9 && e.firstTabInLine === -1 && (e.firstTabInLine = e.position), r = e.input.charCodeAt(++e.position);
		if (t && i && r === 35) do
			r = e.input.charCodeAt(++e.position);
		while (!F(r) && r !== 0);
		if (!F(r)) break;
		for (hn(e), n++, i = !0, r = e.input.charCodeAt(e.position); r === 32;) e.lineIndent++, r = e.input.charCodeAt(++e.position);
	}
	return n;
}
function V(e, t = e.position) {
	let n = e.input.charCodeAt(t);
	if ((n === 45 || n === 46) && n === e.input.charCodeAt(t + 1) && n === e.input.charCodeAt(t + 2)) {
		let n = e.input.charCodeAt(t + 3);
		return n === 0 || L(n);
	}
	return !1;
}
function gn(e) {
	let t = e.input.charCodeAt(e.position);
	for (; t !== 0 && !F(t);) t = e.input.charCodeAt(++e.position);
}
function _n(e, t, n) {
	Yt.test(e.input.slice(t, n)) && P(e, "the stream contains non-printable characters");
}
function vn(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 33) return !1;
	t.tagStart !== D && P(e, "duplication of a tag property");
	let r = e.position, i = !1, a = !1, o = "!", s = e.input.charCodeAt(++e.position);
	s === 60 ? (i = !0, s = e.input.charCodeAt(++e.position)) : s === 33 && (a = !0, o = "!!", s = e.input.charCodeAt(++e.position));
	let c = e.position, l;
	if (i) {
		for (; s !== 0 && s !== 62;) s = e.input.charCodeAt(++e.position);
		s !== 62 && P(e, "unexpected end of the stream within a verbatim tag"), l = e.input.slice(c, e.position), e.position++;
	} else {
		for (; s !== 0 && !L(s) && !(n && z(s));) s === 33 && (a ? P(e, "tag suffix cannot contain exclamation marks") : (o = e.input.slice(c - 1, e.position + 1), Zt.test(o) || P(e, "named tag handle cannot contain such characters"), a = !0, c = e.position + 1)), s = e.input.charCodeAt(++e.position);
		l = e.input.slice(c, e.position), Xt.test(l) && P(e, "tag suffix cannot contain flow indicator characters");
	}
	return l && !(i ? en.test(l) : tn.test(l)) && P(e, `tag name cannot contain such characters: ${l}`), !i && o !== "!" && o !== "!!" && !Gt.call(e.tagHandlers, o) && P(e, `undeclared tag handle "${o}"`), t.tagStart = r, t.tagEnd = e.position, !0;
}
function yn(e, t) {
	if (e.input.charCodeAt(e.position) !== 38) return !1;
	t.anchorStart !== D && P(e, "duplication of an anchor property"), e.position++;
	let n = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !L(e.input.charCodeAt(e.position)) && !z(e.input.charCodeAt(e.position));) e.position++;
	return e.position === n && P(e, "name of an anchor node must contain at least one character"), t.anchorStart = n, t.anchorEnd = e.position, !0;
}
function bn(e, t) {
	if (e.input.charCodeAt(e.position) !== 42) return !1;
	(t.anchorStart !== D || t.tagStart !== D) && P(e, "alias node should not have any properties"), e.position++;
	let n = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !L(e.input.charCodeAt(e.position)) && !z(e.input.charCodeAt(e.position));) e.position++;
	return e.position === n && P(e, "name of an alias node must contain at least one character"), ln(e, n, e.position), !0;
}
function xn(e, t) {
	B(e, !1), e.lineIndent < t && P(e, "deficient indentation");
}
function Sn(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 39) return !1;
	e.position++;
	let r = e.position, i = !0;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let a = e.input.charCodeAt(e.position);
		if (a === 39) {
			if (e.input.charCodeAt(e.position + 1) === 39) {
				i = !1, e.position += 2;
				continue;
			}
			let t = e.position;
			return e.position++, k(e, r, t, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, S.SINGLE_QUOTED, w.CLIP, -1, i), !0;
		}
		F(a) ? (i = !1, xn(e, t)) : e.position === e.lineStart && V(e) ? P(e, "unexpected end of the document within a single quoted scalar") : a !== 9 && a < 32 ? P(e, "expected valid JSON character") : e.position++;
	}
	P(e, "unexpected end of the stream within a single quoted scalar");
}
function Cn(e, t, n) {
	if (e.input.charCodeAt(e.position) !== 34) return !1;
	e.position++;
	let r = e.position, i = !0;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let a = e.input.charCodeAt(e.position);
		if (a === 34) {
			let t = e.position;
			return e.position++, k(e, r, t, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, S.DOUBLE_QUOTED, w.CLIP, -1, i), !0;
		}
		if (a === 92) {
			i = !1;
			let n = e.input.charCodeAt(++e.position);
			if (F(n)) xn(e, t);
			else if (mn(n)) e.position++;
			else {
				let t = pn(n);
				for (t === 0 && P(e, "unknown escape sequence"); t-- > 0;) e.position++, fn(e.input.charCodeAt(e.position)) < 0 && P(e, "expected hexadecimal character");
				e.position++;
			}
		} else F(a) ? (i = !1, xn(e, t)) : e.position === e.lineStart && V(e) ? P(e, "unexpected end of the document within a double quoted scalar") : a !== 9 && a < 32 ? P(e, "expected valid JSON character") : e.position++;
	}
	P(e, "unexpected end of the stream within a double quoted scalar");
}
function wn(e, t, n) {
	let r = e.input.charCodeAt(e.position), i = w.CLIP, a = -1, o = !1;
	if (r !== 124 && r !== 62) return !1;
	let s = r === 124 ? S.LITERAL_BLOCK : S.FOLDED_BLOCK;
	for (e.position++; e.input.charCodeAt(e.position) !== 0;) {
		let n = e.input.charCodeAt(e.position), r = dn(n);
		if (n === 43 || n === 45) i !== w.CLIP && P(e, "repeat of a chomping mode identifier"), i = n === 43 ? w.KEEP : w.STRIP, e.position++;
		else if (r >= 0) r === 0 && P(e, "bad explicit indentation width of a block scalar; it cannot be less than one"), o && P(e, "repeat of an indentation width identifier"), a = t + r - 1, o = !0, e.position++;
		else break;
	}
	let c = !1;
	for (; I(e.input.charCodeAt(e.position));) c = !0, e.position++;
	c && e.input.charCodeAt(e.position) === 35 && gn(e), F(e.input.charCodeAt(e.position)) ? hn(e) : e.input.charCodeAt(e.position) !== 0 && P(e, "a line break is expected");
	let l = o ? a : -1, u = 0, d = e.position, f = e.position;
	for (; e.input.charCodeAt(e.position) !== 0;) {
		let n = e.position, r = 0;
		for (; e.input.charCodeAt(n + r) === 32;) r++;
		let i = e.input.charCodeAt(n + r);
		if (i === 0) {
			l >= 0 ? r > l && (f = n + r) : r > 0 && (f = n + r);
			break;
		}
		if (n === e.lineStart && V(e, n)) break;
		if (!o && l === -1 && F(i) && (u = Math.max(u, r)), !o && l === -1 && !F(i) && (i === 9 && r < t && (e.position = n + r, P(e, "tab characters must not be used in indentation")), r < u && (e.position = n + r, P(e, "bad indentation of a mapping entry"))), l === -1 && i !== 0 && !F(i) && r < t) {
			e.lineIndent = r, e.position = n + r;
			break;
		}
		!o && i !== 0 && !F(i) && l === -1 && (l = r);
		let a = l === -1 ? t + 1 : l;
		if (i !== 0 && !F(i) && r < a) {
			e.lineIndent = r, e.position = n + r;
			break;
		}
		gn(e), f = e.position, F(e.input.charCodeAt(e.position)) && (hn(e), f = e.position);
	}
	return _n(e, d, f), k(e, d, f, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, s, i, l), !0;
}
function Tn(e, t) {
	let n = e.input.charCodeAt(e.position), r = t === O;
	if (n === 0 || L(n) || n === 35 || n === 38 || n === 42 || n === 33 || n === 124 || n === 62 || n === 39 || n === 34 || n === 37 || n === 64 || n === 96 || r && z(n)) return !1;
	if (n === 63 || n === 45) {
		let t = e.input.charCodeAt(e.position + 1);
		if (R(t) || r && z(t)) return !1;
	}
	return !0;
}
function En(e, t, n, r) {
	if (!Tn(e, n)) return !1;
	let i = e.position, a = e.position, o = e.input.charCodeAt(e.position), s = n === O, c = !1;
	for (; o !== 0 && !(e.position === e.lineStart && V(e));) {
		if (o === 58) {
			let t = e.input.charCodeAt(e.position + 1);
			if (R(t) || s && z(t)) break;
		} else if (o === 35) {
			if (L(e.input.charCodeAt(e.position - 1))) break;
		} else if (s && z(o)) break;
		else if (F(o)) {
			let n = e.position, r = e.line, i = e.lineStart, a = e.lineIndent;
			if (B(e, !1), e.lineIndent >= t) {
				c = !0, o = e.input.charCodeAt(e.position);
				continue;
			}
			e.position = n, e.line = r, e.lineStart = i, e.lineIndent = a;
			break;
		}
		I(o) || (a = e.position + 1), o = e.input.charCodeAt(++e.position);
	}
	return a === i ? !1 : (_n(e, i, a), k(e, i, a, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, S.PLAIN, w.CLIP, -1, !c), !0);
}
function H(e, t) {
	let n = e.line;
	B(e, !0), (e.line > n && e.lineIndent < t || e.firstTabInLine !== -1 && e.lineIndent < t) && P(e, "deficient indentation");
}
function Dn(e, t, n) {
	let r = e.input.charCodeAt(e.position), i = r === 123, a = e.position, o = !0;
	if (r !== 91 && r !== 123) return !1;
	let s = i ? 125 : 93;
	for (i ? sn(e, a, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, C.FLOW) : on(e, a, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, C.FLOW), e.position++; e.input.charCodeAt(e.position) !== 0;) {
		H(e, t);
		let n = e.input.charCodeAt(e.position);
		if (n === s) return e.position++, A(e), !0;
		o ? n === 44 && P(e, "expected the node content, but found ','") : P(e, "missed comma between flow collection entries");
		let r = !1, a = !1;
		n === 63 && L(e.input.charCodeAt(e.position + 1)) && (r = a = !0, e.position += 1, H(e, t));
		let c = e.line, l = M(e), u = U(e, t, O, !1, !0);
		H(e, t), n = e.input.charCodeAt(e.position), (i || a || e.line === c) && n === 58 ? (r = !0, e.position++, H(e, t), i || cn(e, l), u || j(e), U(e, t, O, !1, !0) || j(e), H(e, t), i || A(e)) : i && r ? (u || j(e), j(e)) : i ? j(e) : r && (cn(e, l), u || j(e), j(e), A(e)), n = e.input.charCodeAt(e.position), n === 44 ? (o = !0, e.position++) : o = !1;
	}
	P(e, "unexpected end of the stream within a flow collection");
}
function On(e, t, n) {
	if (e.firstTabInLine !== -1 || e.input.charCodeAt(e.position) !== 45 || !R(e.input.charCodeAt(e.position + 1))) return !1;
	for (on(e, e.position, n.anchorStart, n.anchorEnd, n.tagStart, n.tagEnd, C.BLOCK); e.input.charCodeAt(e.position) === 45 && R(e.input.charCodeAt(e.position + 1));) {
		e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, P(e, "tab characters must not be used in indentation"));
		let n = e.line;
		e.position++;
		let r = B(e, !0) > 0;
		if (e.firstTabInLine !== -1 && e.input.charCodeAt(e.position) === 45 && R(e.input.charCodeAt(e.position + 1)) && P(e, "bad indentation of a sequence entry"), r && e.lineIndent <= t ? j(e) : U(e, t, qt, !1, !0), B(e, !0), e.lineIndent < t || e.position >= e.length) break;
		e.lineIndent > t && P(e, "bad indentation of a sequence entry"), e.line === n && e.input.charCodeAt(e.position) === 45 && R(e.input.charCodeAt(e.position + 1)) && P(e, "bad indentation of a sequence entry");
	}
	return A(e), !0;
}
function kn(e, t, n, r) {
	let i = !1, a = !1, o = !1, s = !1;
	if (e.firstTabInLine !== -1) return !1;
	let c = e.input.charCodeAt(e.position);
	for (; c !== 0;) {
		!i && e.firstTabInLine !== -1 && (e.position = e.firstTabInLine, P(e, "tab characters must not be used in indentation"));
		let l = e.input.charCodeAt(e.position + 1), u = e.line;
		if ((c === 63 || c === 58) && R(l)) o || (sn(e, e.position, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, C.BLOCK), o = !0), c === 63 ? (i && j(e), a = !0, i = !0) : i ? i = !1 : (j(e), a = !0, i = !1), e.position += 1, s = !0;
		else {
			i && (j(e), i = !1);
			let t = M(e);
			if (!U(e, n, Kt, !1, !0)) break;
			if (e.line === u) {
				for (c = e.input.charCodeAt(e.position); I(c);) c = e.input.charCodeAt(++e.position);
				if (c === 58) {
					if (c = e.input.charCodeAt(++e.position), R(c) || P(e, "a whitespace character is expected after the key-value separator within a block mapping"), !o) {
						for (N(e, t), sn(e, t.position, r.anchorStart, r.anchorEnd, r.tagStart, r.tagEnd, C.BLOCK), o = !0, U(e, n, Kt, !1, !0), c = e.input.charCodeAt(e.position); I(c);) c = e.input.charCodeAt(++e.position);
						e.position++;
					}
					a = !0, i = !1, s = !1;
				} else if (a) P(e, "expected ':' after a mapping key");
				else return r.anchorStart !== D || r.tagStart !== D ? (N(e, t), !1) : !0;
			} else if (a) P(e, "can not read a block mapping entry; a multiline key may not be an implicit key");
			else return r.anchorStart !== D || r.tagStart !== D ? (N(e, t), !1) : !0;
		}
		if (U(e, t, Jt, !0, s) && (s = !1), i || s && (j(e), s = !1), B(e, !0), c = e.input.charCodeAt(e.position), (e.line === u || e.lineIndent > t) && c !== 0) P(e, "bad indentation of a mapping entry");
		else if (e.lineIndent < t) break;
	}
	return a ? (i && j(e), o && A(e), !0) : !1;
}
function U(e, t, n, r, i, a = !0) {
	e.depth >= e.maxDepth && P(e, `nesting exceeded maxDepth (${e.maxDepth})`), e.depth++;
	let o = 1, s = !1, c = !1, l = null, u = un(), d = n === Jt || n === qt, f = d, p = d;
	if (r && B(e, !0) && (s = !0, o = e.lineIndent > t ? 1 : e.lineIndent === t ? 0 : -1), o === 1) for (;;) {
		let r = e.input.charCodeAt(e.position), i = M(e);
		if (s && o !== 1 && (r === 33 || r === 38)) break;
		if (s && p && (u.tagStart !== D || u.anchorStart !== D) && (r === 33 || r === 38)) {
			var m;
			let n = M(e), r = t + 1;
			if (kn(e, e.position - e.lineStart, r, u) && ((m = e.events[n.eventsLength]) == null ? void 0 : m.type) === x.MAPPING) return e.depth--, !0;
			N(e, n);
		}
		if (s && (r === 33 && u.tagStart !== D || r === 38 && u.anchorStart !== D) || !vn(e, u, n === O) && !yn(e, u)) break;
		l === null && (l = i), B(e, !0) ? (s = !0, f = p, o = e.lineIndent > t ? 1 : e.lineIndent === t ? 0 : -1) : f = !1;
	}
	if (f && (f = s || i), o === 1 || n === Jt) {
		let r = n === O || n === Kt ? t : t + 1, i = e.position - e.lineStart;
		if (o === 1) if (f && (On(e, i, u) || kn(e, i, r, u)) || Dn(e, r, u)) c = !0;
		else {
			let t = e.input.charCodeAt(e.position);
			if (l !== null && a && p && !f && t !== 124 && t !== 62) {
				var h;
				let t = M(e), n = l.position - l.lineStart;
				N(e, l), kn(e, n, r, un()) && ((h = e.events[t.eventsLength]) == null ? void 0 : h.type) === x.MAPPING ? c = !0 : N(e, t);
			}
			!c && (d && wn(e, r, u) || Sn(e, r, u) || Cn(e, r, u) || bn(e, u) || En(e, r, n, u)) && (c = !0);
		}
		else o === 0 && (c = f && On(e, i, u));
	}
	return d = d && !c, !c && (u.anchorStart !== D || u.tagStart !== D || d) && (k(e, D, D, u.anchorStart, u.anchorEnd, u.tagStart, u.tagEnd, S.PLAIN), c = !0), e.depth--, c || u.anchorStart !== D || u.tagStart !== D;
}
function An(e) {
	if (e.lineIndent > 0 || e.input.charCodeAt(e.position) !== 37) return !1;
	e.position++;
	let t = e.position;
	for (; e.input.charCodeAt(e.position) !== 0 && !L(e.input.charCodeAt(e.position));) e.position++;
	let n = e.input.slice(t, e.position), r = [];
	for (n.length === 0 && P(e, "directive name must not be less than one character in length"); e.input.charCodeAt(e.position) !== 0 && !F(e.input.charCodeAt(e.position));) {
		for (; I(e.input.charCodeAt(e.position));) e.position++;
		if (e.input.charCodeAt(e.position) === 35 || F(e.input.charCodeAt(e.position)) || e.input.charCodeAt(e.position) === 0) break;
		let t = e.position;
		for (; e.input.charCodeAt(e.position) !== 0 && !L(e.input.charCodeAt(e.position));) e.position++;
		r.push(e.input.slice(t, e.position));
	}
	if (F(e.input.charCodeAt(e.position)) && hn(e), n === "YAML") {
		e.directives.some((e) => e.kind === "yaml") && P(e, "duplication of %YAML directive"), r.length !== 1 && P(e, "YAML directive accepts exactly one argument");
		let t = /^([0-9]+)\.([0-9]+)$/.exec(r[0]);
		t === null && P(e, "ill-formed argument of the YAML directive"), parseInt(t[1], 10) !== 1 && P(e, "unacceptable YAML version of the document"), e.directives.push({
			kind: "yaml",
			version: r[0]
		});
	} else if (n === "TAG") {
		r.length !== 2 && P(e, "TAG directive accepts exactly two arguments");
		let [t, n] = r;
		Zt.test(t) || P(e, "ill-formed tag handle (first argument) of the TAG directive"), Gt.call(e.tagHandlers, t) && P(e, `there is a previously declared suffix for "${t}" tag handle`), nn.test(n) || P(e, "ill-formed tag prefix (second argument) of the TAG directive"), e.tagHandlers[t] = n, e.directives.push({
			kind: "tag",
			handle: t,
			prefix: n
		});
	}
	return !0;
}
function jn(e) {
	e.directives = [], e.tagHandlers = Object.create(null);
	let t = !1;
	for (B(e, !0); An(e);) t = !0, B(e, !0);
	let n = !1, r = !1, i = !0;
	if (e.lineIndent === 0 && e.input.charCodeAt(e.position) === 45 && e.input.charCodeAt(e.position + 1) === 45 && e.input.charCodeAt(e.position + 2) === 45 && R(e.input.charCodeAt(e.position + 3))) {
		n = !0;
		let t = e.line;
		e.position += 3, B(e, !0), i = e.line > t;
	} else t && P(e, "directives end mark is expected");
	let a = e.events.length;
	if (!n && e.position === e.lineStart && e.input.charCodeAt(e.position) === 46 && V(e)) {
		e.position += 3, B(e, !0);
		return;
	}
	if (an(e, n, !1), U(e, e.lineIndent - 1, Jt, !1, i, i) || j(e), B(e, !0), e.position === e.lineStart && V(e) && (r = e.input.charCodeAt(e.position) === 46, r)) {
		let t = e.line;
		e.position += 3, B(e, !0), e.line === t && e.position < e.length && P(e, "end of the stream or a document separator is expected");
	}
	let o = e.events[a];
	(o == null ? void 0 : o.type) === x.DOCUMENT && (o.explicitEnd = r), A(e), !r && e.position < e.length && !(e.position === e.lineStart && V(e)) && P(e, "end of the stream or a document separator is expected");
}
function Mn(e, t) {
	let n = e.length, r = v(v(v({}, rn), t), {}, {
		input: `${e}\0`,
		length: n,
		position: 0,
		line: 0,
		lineStart: 0,
		lineIndent: 0,
		firstTabInLine: -1,
		depth: 0,
		directives: [],
		tagHandlers: Object.create(null),
		events: []
	}), i = e.indexOf("\0");
	for (i !== -1 && b.throwAt(e, i, "null byte is not allowed in input", r.filename), r.input.charCodeAt(r.position) === 65279 && r.position++; r.position < r.length && (B(r, !0), !(r.position >= r.length));) {
		let e = r.position;
		jn(r), r.position === e && P(r, "can not read a document");
	}
	return r.events;
}
//#endregion
//#region src/load.ts
var Nn = v(v({}, rn), Nt);
function Pn(e, t = {}) {
	let n = v(v({}, Nn), t), r = String(e), i = Object.keys(rn), a = Object.keys(Nt);
	return Wt(Mn(r, We(n, i)), v(v({}, We(n, a)), {}, { source: r }));
}
function Fn(e, t, n) {
	let r = null;
	typeof t == "function" ? r = t : typeof t == "object" && t && (n = t);
	let i = Pn(e, n);
	if (r === null) return i;
	for (let e of i) r(e);
}
function In(e, t) {
	let n = Pn(e, t);
	if (n.length === 0) throw new b("expected a document, but the input is empty");
	if (n.length === 1) return n[0];
	throw new b("expected a single document in the stream, but found more");
}
//#endregion
//#region src/ast/nodes.ts
var W = class {
	constructor() {
		_(this, "tagged", !1), _(this, "flow", !1), _(this, "singleQuoted", !1), _(this, "doubleQuoted", !1), _(this, "literal", !1), _(this, "folded", !1);
	}
}, G = Symbol("INVALID");
function Ln(e) {
	let t = new Set([
		e.defaultScalarTag,
		e.defaultSequenceTag,
		e.defaultMappingTag
	].filter((e) => e !== void 0)), n = e.implicitScalarTags, r = e.tags.filter((e) => !(e.nodeKind === "scalar" && e.implicit) && !t.has(e)), i = e.tags.filter((e) => t.has(e));
	return [
		...n.map((e) => ({
			tag: e,
			implicitTag: !0
		})),
		...r.map((e) => ({
			tag: e,
			implicitTag: !1
		})),
		...i.map((e) => ({
			tag: e,
			implicitTag: !0
		}))
	];
}
function Rn(e, t) {
	for (let n = 0, r = e.representTypes.length; n < r; n += 1) {
		let { tag: r, implicitTag: i } = e.representTypes[n];
		if (r.identify(t)) {
			let e;
			return e = r.matchByTagPrefix ? r.representTagName(t) : r.tagName, {
				tag: r,
				tagName: e,
				implicitTag: i
			};
		}
	}
	return null;
}
function zn(e, t) {
	if (!e.noRefs && typeof t == "object" && t) {
		let n = e.refs.get(t);
		if (n) return n.anchor === void 0 && (n.anchor = `ref_${e.refCounter++}`), {
			kind: "alias",
			tag: "",
			style: new W(),
			anchor: n.anchor
		};
	}
	let n = Rn(e, t);
	if (!n) {
		if (t === void 0 || e.skipInvalid) return G;
		throw new b(`unacceptable kind of an object to dump ${Object.prototype.toString.call(t)}`);
	}
	let { tag: r, tagName: i, implicitTag: a } = n, o = a ? i : jt(i);
	if (r.nodeKind === "scalar") {
		let e = new W();
		return e.tagged = !a, {
			kind: "scalar",
			tag: o,
			style: e,
			value: r.represent(t)
		};
	}
	if (r.nodeKind === "sequence") {
		let n = r.represent(t), i = new W();
		i.tagged = !a;
		let s = {
			kind: "sequence",
			tag: o,
			style: i,
			items: []
		};
		e.noRefs || e.refs.set(t, s);
		for (let t = 0, r = n.length; t < r; t += 1) {
			let r = zn(e, n[t]);
			r === G && n[t] === void 0 && (r = zn(e, null)), r !== G && s.items.push(r);
		}
		return s;
	}
	let s = r.represent(t), c = new W();
	c.tagged = !a;
	let l = {
		kind: "mapping",
		tag: o,
		style: c,
		items: []
	};
	e.noRefs || e.refs.set(t, l);
	for (let [t, n] of s) {
		let r = zn(e, t);
		if (r === G) continue;
		let i = zn(e, n);
		i !== G && l.items.push({
			key: r,
			value: i
		});
	}
	return l;
}
function Bn(e, t, n = {}) {
	var r, i;
	let a = zn({
		representTypes: Ln(t),
		noRefs: (r = n.noRefs) == null ? !1 : r,
		skipInvalid: (i = n.skipInvalid) == null ? !1 : i,
		refs: /* @__PURE__ */ new Map(),
		refCounter: 0
	}, e);
	return [{
		contents: a === G ? null : a,
		directives: []
	}];
}
//#endregion
//#region src/ast/visit.ts
var Vn = Symbol("visit:break"), Hn = Symbol("visit:skip");
function Un(e, t, n) {
	let r = t(e, n);
	if (r === Vn) return !0;
	if (r === Hn) return !1;
	let i = n.depth + 1;
	switch (e.kind) {
		case "sequence":
			for (let n of e.items) if (Un(n, t, {
				depth: i,
				parent: e,
				isKey: !1
			})) return !0;
			break;
		case "mapping":
			for (let { key: n, value: r } of e.items) if (Un(n, t, {
				depth: i,
				parent: e,
				isKey: !0
			}) || Un(r, t, {
				depth: i,
				parent: e,
				isKey: !1
			})) return !0;
			break;
	}
	return !1;
}
function Wn(e, t) {
	for (let n of e) if (n.contents && Un(n.contents, t, {
		depth: 0,
		parent: null,
		isKey: !1
	})) return;
}
//#endregion
//#region src/ast/presenter.ts
var Gn = 65279, Kn = 9, K = 10, qn = 13, Jn = 32, Yn = 33, Xn = 34, Zn = 35, Qn = 37, $n = 38, er = 39, tr = 42, nr = 44, rr = 45, ir = 58, ar = 61, or = 62, sr = 63, cr = 64, lr = 91, ur = 93, dr = 96, fr = 123, pr = 124, mr = 125, q = {};
q[0] = "\\0", q[7] = "\\a", q[8] = "\\b", q[9] = "\\t", q[10] = "\\n", q[11] = "\\v", q[12] = "\\f", q[13] = "\\r", q[27] = "\\e", q[34] = "\\\"", q[92] = "\\\\", q[133] = "\\N", q[160] = "\\_", q[8232] = "\\L", q[8233] = "\\P";
var hr = {
	indent: 2,
	seqNoIndent: !1,
	seqInlineFirst: !0,
	sortKeys: !1,
	lineWidth: 80,
	flowBracketPadding: !1,
	flowSkipCommaSpace: !1,
	flowSkipColonSpace: !1,
	quoteFlowKeys: !1,
	quoteStyle: "single",
	forceQuotes: !1,
	tagBeforeAnchor: !1
};
function gr(e) {
	return e.style.tagged ? e.tag : jt(e.tag);
}
function _r(e) {
	let t = v(v({}, hr), e);
	return v(v({}, t), {}, { defaultScalarTagName: t.schema.defaultScalarTag.tagName });
}
function vr(e) {
	let t = e.toString(16).toUpperCase(), n = e <= 255 ? "x" : "u", r = e <= 255 ? 2 : 4;
	return `\\${n}${"0".repeat(r - t.length)}${t}`;
}
function yr(e, t) {
	let n = " ".repeat(t), r = 0, i = "", a = e.length;
	for (; r < a;) {
		let t, o = e.indexOf("\n", r);
		o === -1 ? (t = e.slice(r), r = a) : (t = e.slice(r, o + 1), r = o + 1), t.length && t !== "\n" && (i += n), i += t;
	}
	return i;
}
function br(e, t) {
	return `\n${" ".repeat(e.indent * t)}`;
}
function xr(e, t) {
	let n = e.indent * Math.max(1, t);
	return {
		indent: n,
		blockIndent: t === 0 ? e.indent + 1 : e.indent,
		lineWidth: e.lineWidth === -1 ? -1 : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - n)
	};
}
function J(e) {
	return e === Jn || e === Kn;
}
function Sr(e) {
	let t = e.charCodeAt(0);
	if (t !== rr && t !== 46 || e.charCodeAt(1) !== t || e.charCodeAt(2) !== t) return !1;
	if (e.length === 3) return !0;
	let n = e.charCodeAt(3);
	return J(n) || n === qn || n === K;
}
function Cr(e) {
	return e >= 32 && e <= 126 || e >= 161 && e <= 55295 && e !== 8232 && e !== 8233 || e >= 57344 && e <= 65533 && e !== Gn || e >= 65536 && e <= 1114111;
}
function wr(e) {
	return Cr(e) && e !== Gn && e !== qn && e !== K;
}
function Tr(e, t, n) {
	let r = wr(e), i = r && !J(e);
	return (n ? r : r && e !== nr && e !== lr && e !== ur && e !== fr && e !== mr) && e !== Zn && !(t === ir && !i) || wr(t) && !J(t) && e === Zn || t === ir && i && (n || e !== nr && e !== lr && e !== ur && e !== fr && e !== mr);
}
function Er(e) {
	return Cr(e) && e !== Gn && !J(e) && e !== rr && e !== sr && e !== ir && e !== nr && e !== lr && e !== ur && e !== fr && e !== mr && e !== Zn && e !== $n && e !== tr && e !== Yn && e !== pr && e !== ar && e !== or && e !== er && e !== Xn && e !== Qn && e !== cr && e !== dr;
}
function Dr(e, t) {
	let n = Y(e, 0);
	if (Er(n)) return !0;
	if (e.length > 1 && (n === rr || n === sr || n === ir)) {
		let r = Y(e, 1);
		return !J(r) && Tr(r, n, t);
	}
	return !1;
}
function Or(e) {
	return !J(e) && e !== ir;
}
function Y(e, t) {
	let n = e.charCodeAt(t), r;
	return n >= 55296 && n <= 56319 && t + 1 < e.length && (r = e.charCodeAt(t + 1), r >= 56320 && r <= 57343) ? (n - 55296) * 1024 + r - 56320 + 65536 : n;
}
function kr(e) {
	return /^\n* /.test(e);
}
var Ar = 1, jr = 2, Mr = 3, Nr = 4, X = 5;
function Pr(e, t, n, r, i, a) {
	let { blockIndent: o, lineWidth: s } = n, c, l = 0, u = -1, d = !1, f = !1, p = s !== -1, m = -1, h = !Sr(t) && Dr(t, a) && Or(Y(t, t.length - 1));
	if (r || i) for (c = 0; c < t.length; l >= 65536 ? c += 2 : c++) {
		if (l = Y(t, c), !Cr(l)) return X;
		h = h && Tr(l, u, a), u = l;
	}
	else {
		for (c = 0; c < t.length; l >= 65536 ? c += 2 : c++) {
			if (l = Y(t, c), l === K) d = !0, p && (f = f || c - m - 1 > s && !Z(t[m + 1]), m = c);
			else if (!Cr(l)) return X;
			h = h && Tr(l, u, a), u = l;
		}
		f = f || p && c - m - 1 > s && !Z(t[m + 1]);
	}
	return !d && !f ? h && !i ? Ar : e.quoteStyle === "double" ? X : jr : o > 9 && kr(t) ? X : f ? Nr : Mr;
}
function Fr(e, t, n) {
	let { indent: r, blockIndent: i, lineWidth: a } = n;
	switch (t) {
		case Ar: return Rr(e, r);
		case jr: return `'${Rr(e, r).replace(/'/g, "''")}'`;
		case Mr: return "|" + Lr(e, i) + zr(yr(e, r));
		case Nr: return ">" + Lr(e, i) + zr(yr(Br(e, a), r));
		case X: return `"${Hr(e)}"`;
	}
}
function Ir(e, t, n, r, i) {
	let a = r || !i;
	if (t.style.singleQuoted) return jr;
	if (t.style.doubleQuoted) return X;
	if (!a) {
		if (t.style.literal) return Mr;
		if (t.style.folded) return Nr;
	}
	let o = t.value;
	if (o.length === 0) return t.style.tagged || e.schema.resolveImplicitScalarTag(o).tag.tagName === t.tag ? Ar : e.quoteStyle === "double" ? X : jr;
	let s = Pr(e, o, n, a, e.forceQuotes && !r, i);
	return s === Ar && !t.style.tagged && e.schema.resolveImplicitScalarTag(o).tag.tagName !== t.tag ? e.quoteStyle === "double" ? X : jr : s;
}
function Lr(e, t) {
	let n = kr(e) ? String(t) : "", r = e[e.length - 1] === "\n";
	return `${n}${r && (e[e.length - 2] === "\n" || e === "\n") ? "+" : r ? "" : "-"}\n`;
}
function Rr(e, t) {
	let n = e.indexOf("\n");
	if (n === -1) return e;
	let r = " ".repeat(t), i = e.slice(0, n), a = /(\n+)([^\n]*)/g;
	a.lastIndex = n;
	let o;
	for (; o = a.exec(e);) {
		let e = o[1].length, t = o[2];
		i += "\n".repeat(e + 1) + r + t;
	}
	return i;
}
function zr(e) {
	return e[e.length - 1] === "\n" ? e.slice(0, -1) : e;
}
function Z(e) {
	return e === " " || e === "	";
}
function Br(e, t) {
	let n = /(\n+)([^\n]*)/g, r = e.indexOf("\n");
	r === -1 && (r = e.length), n.lastIndex = r;
	let i = Vr(e.slice(0, r), t), a = e[0] === "\n" || Z(e[0]), o, s;
	for (; s = n.exec(e);) {
		let e = s[1], n = s[2];
		o = n !== "" && Z(n[0]), i += e + (!a && !o && n !== "" ? "\n" : "") + Vr(n, t), a = o;
	}
	return i;
}
function Vr(e, t) {
	if (e === "" || Z(e[0])) return e;
	let n = / [^ \t]/g, r, i = 0, a, o = 0, s = 0, c = "";
	for (; r = n.exec(e);) s = r.index, s - i > t && (a = o > i ? o : s, c += `\n${e.slice(i, a)}`, i = a + 1), o = s;
	return c += "\n", e.length - i > t && o > i ? c += `${e.slice(i, o)}\n${e.slice(o + 1)}` : c += e.slice(i), c.slice(1);
}
function Hr(e) {
	let t = "", n = 0;
	for (let r = 0; r < e.length; n >= 65536 ? r += 2 : r++) {
		n = Y(e, r);
		let i = q[n];
		if (i) {
			t += i;
			continue;
		}
		if (Cr(n)) {
			t += e[r], n >= 65536 && (t += e[r + 1]);
			continue;
		}
		t += vr(n);
	}
	return t;
}
function Ur(e, t, n) {
	let r = "";
	for (let i = 0, a = n.items.length; i < a; i += 1) {
		let a = Q(e, t, n.items[i], {});
		r !== "" && (r += `,${e.flowSkipCommaSpace ? "" : " "}`), r += a;
	}
	let i = e.flowBracketPadding && r !== "" ? " " : "";
	return `[${i}${r}${i}]`;
}
function Wr(e, t, n, r) {
	let i = "";
	for (let a = 0, o = n.items.length; a < o; a += 1) {
		let o = Q(e, t + 1, n.items[a], {
			block: !0,
			compact: e.seqInlineFirst,
			isblockseq: !0
		});
		(!r || i !== "") && (i += br(e, t)), o === "" || K === o.charCodeAt(0) ? i += "-" : i += "- ", i += o;
	}
	return i;
}
function Gr(e, t, n) {
	let r = "", i = qr(e, n.items);
	for (let { key: n, value: a } of i) {
		let i = "";
		r !== "" && (i += `,${e.flowSkipCommaSpace ? "" : " "}`);
		let o = Q(e, t, n, { iskey: !0 }), s = o.length > 1024;
		s ? i += "? " : e.quoteFlowKeys && (i += "\"");
		let c = Q(e, t, a, {}), l = e.flowSkipColonSpace || c === "" ? "" : " ";
		i += `${o}${e.quoteFlowKeys && !s ? "\"" : ""}:${l}${c}`, r += i;
	}
	let a = e.flowBracketPadding && r !== "" ? " " : "";
	return `{${a}${r}${a}}`;
}
function Kr(e) {
	return e.kind === "scalar" ? e.value : e;
}
function qr(e, t) {
	if (!e.sortKeys) return t;
	let n = t.slice();
	if (e.sortKeys === !0) n.sort((e, t) => {
		let n = Kr(e.key), r = Kr(t.key);
		return n < r ? -1 : +(n > r);
	});
	else {
		let t = e.sortKeys;
		n.sort((e, n) => t(Kr(e.key), Kr(n.key)));
	}
	return n;
}
function Jr(e, t, n, r) {
	let i = "", a = qr(e, n.items);
	for (let n = 0, o = a.length; n < o; n += 1) {
		let o = "";
		(!r || i !== "") && (o += br(e, t));
		let { key: s, value: c } = a[n], l = (s.kind === "mapping" || s.kind === "sequence") && !s.style.flow && s.items.length !== 0 || s.kind === "scalar" && (s.style.literal || s.style.folded), u = l ? Q(e, t + 1, s, {
			block: !0,
			compact: !0,
			isblockseq: !Yr(e, s, t + 1)
		}) : Q(e, t + 1, s, {
			block: !0,
			compact: !0,
			iskey: !0
		}), d = s.kind === "scalar" && s.value.indexOf("\n") !== -1, f = l || d || u.length > 1024;
		f && (u && K === u.charCodeAt(0) ? o += "?" : o += "? "), o += u, f && (o += br(e, t));
		let p = Q(e, t + 1, c, {
			block: !0,
			compact: f,
			isblockseq: f && !Yr(e, c, t + 1)
		}), m = s.kind === "scalar" && s.value === "" && u !== "" && u.charCodeAt(u.length - 1) !== er && u.charCodeAt(u.length - 1) !== Xn, h = !f && (s.kind === "alias" || m) ? " " : "";
		p === "" || K === p.charCodeAt(0) ? o += `${h}:` : o += `${h}: `, o += p, i += o;
	}
	return i;
}
function Yr(e, t, n) {
	return t.style.tagged || t.anchor !== void 0 || e.indent < 2 && n > 0;
}
function Q(e, t, n, r) {
	var i;
	if (n.kind === "alias") return `*${n.anchor}`;
	let { block: a = !1, iskey: o = !1, isblockseq: s = !1 } = r, c = (i = r.compact) == null ? !1 : i, l = n.anchor !== void 0;
	Yr(e, n, t) && (c = !1);
	let u, d = n.style.tagged, f = a && (n.kind === "mapping" || n.kind === "sequence") && !n.style.flow && n.items.length !== 0;
	if (n.kind === "mapping") u = f ? Jr(e, t, n, c) : Gr(e, t, n);
	else if (n.kind === "sequence") u = f ? e.seqNoIndent && !s && t > 0 ? Wr(e, t - 1, n, c) : Wr(e, t, n, c) : Ur(e, t, n);
	else {
		let r = xr(e, t), i = Ir(e, n, r, o, a);
		u = Fr(n.value, i, r), d = n.style.tagged || i !== Ar && n.tag !== e.defaultScalarTagName;
	}
	if (f && c && t > 0 && e.indent > 2 && (u = `${" ".repeat(e.indent - 2)}${u}`), d || l) {
		let t = [], r = d ? gr(n) : null, i = l ? `&${n.anchor}` : null;
		e.tagBeforeAnchor ? (r !== null && t.push(r), i !== null && t.push(i)) : (i !== null && t.push(i), r !== null && t.push(r));
		let a = u === "" || u.charCodeAt(0) === K ? "" : " ";
		u = `${t.join(" ")}${a}${u}`;
	}
	return u;
}
function Xr(e) {
	return (e.kind === "sequence" || e.kind === "mapping") && !e.style.flow && e.items.length !== 0 && !e.style.tagged && e.anchor === void 0;
}
function Zr(e) {
	let t = e;
	for (; (t.kind === "sequence" || t.kind === "mapping") && !t.style.flow && t.items.length !== 0;) t = t.kind === "sequence" ? t.items[t.items.length - 1] : t.items[t.items.length - 1].value;
	if (t.kind !== "scalar" || !(t.style.literal || t.style.folded)) return !1;
	let { value: n } = t;
	return n.endsWith("\n\n") || n === "\n";
}
function Qr(e) {
	let t = "";
	for (let n of e.directives) {
		if (n.kind === "yaml") {
			t += `%YAML ${n.version}\n`;
			continue;
		}
		let { handle: e, prefix: r } = n;
		t += `%TAG ${e} ${r}\n`;
	}
	return t;
}
function $r(e, t) {
	let n = _r(t), r = "", i = !1;
	for (let t = 0; t < e.length; t += 1) {
		let a = e[t], o = Qr(a), s = o !== "", c = a.explicitStart || s || t > 0 && !i;
		if (r += o, a.contents === null) c && (r += "---\n");
		else if (c) {
			let e = Q(n, 0, a.contents, {
				block: !0,
				compact: !0
			}), t = e === "" ? "" : s || Xr(a.contents) ? "\n" : " ";
			r += `---${t}${e}\n`;
		} else r += Q(n, 0, a.contents, {
			block: !0,
			compact: !0
		}) + "\n";
		i = a.explicitEnd || a.contents !== null && Zr(a.contents), i && (r += "...\n");
	}
	return r;
}
//#endregion
//#region src/dump.ts
var ei = v(v({}, hr), {}, {
	schema: at,
	skipInvalid: !1,
	noRefs: !1,
	flowLevel: -1,
	transform: () => {}
});
function ti(e, t = {}) {
	let n = v(v({}, ei), t), r = Bn(e, n.schema, {
		noRefs: n.noRefs,
		skipInvalid: n.skipInvalid
	});
	return n.flowLevel >= 0 && Wn(r, (e, t) => {
		if (!(t.depth < n.flowLevel)) return e.style.flow = !0, Hn;
	}), n.transform(r), $r(r, v(v({}, We(n, Object.keys(hr))), {}, { schema: n.schema }));
}
//#endregion
//#region src/ast/from_events.ts
var $ = -1;
function ni(e) {
	return "tagStart" in e && e.tagStart !== $ ? e.tagStart : "anchorStart" in e && e.anchorStart !== $ ? e.anchorStart : "valueStart" in e && e.valueStart !== $ ? e.valueStart : "start" in e ? e.start : 0;
}
function ri(e, t) {
	return t.tagStart === $ ? "" : e.source.slice(t.tagStart, t.tagEnd);
}
function ii(e, t) {
	return t.anchorStart === $ ? void 0 : e.source.slice(t.anchorStart, t.anchorEnd);
}
function ai(e, t) {
	let n = Dt(e.source, t), r = ri(e, t), i = new W();
	switch (t.style) {
		case S.SINGLE_QUOTED:
			i.singleQuoted = !0;
			break;
		case S.DOUBLE_QUOTED:
			i.doubleQuoted = !0;
			break;
		case S.LITERAL_BLOCK:
			i.literal = !0;
			break;
		case S.FOLDED_BLOCK:
			i.folded = !0;
			break;
	}
	let a;
	return r === "" ? a = t.style === S.PLAIN ? e.schema.resolveImplicitScalarTag(n).tag.tagName : e.schema.defaultScalarTag.tagName : (i.tagged = !0, a = r), {
		kind: "scalar",
		tag: a,
		style: i,
		anchor: ii(e, t),
		value: n
	};
}
function oi(e, t, n) {
	let r = ri(e, t), i = new W();
	t.style === C.FLOW && (i.flow = !0);
	let a;
	return r === "" ? a = n : (a = r, i.tagged = !0), {
		tag: a,
		style: i,
		anchor: ii(e, t)
	};
}
function si(e, t) {
	let n = e.frames[e.frames.length - 1];
	n.kind === "document" ? n.doc.contents = t : n.kind === "sequence" ? n.node.items.push(t) : n.key ? (n.node.items.push({
		key: n.key,
		value: t
	}), n.key = null) : n.key = t;
}
function ci(e, t) {
	let n = {
		source: t.source,
		schema: t.schema,
		eventIndex: 0,
		position: 0,
		frames: [],
		documents: []
	};
	for (; n.eventIndex < e.length;) {
		let t = e[n.eventIndex++];
		switch (n.position = ni(t), t.type) {
			case x.DOCUMENT: {
				let e = {
					contents: null,
					explicitStart: t.explicitStart,
					explicitEnd: t.explicitEnd,
					directives: t.directives
				};
				n.frames.push({
					kind: "document",
					doc: e
				});
				break;
			}
			case x.SCALAR:
				si(n, ai(n, t));
				break;
			case x.SEQUENCE: {
				let { tag: e, style: r, anchor: i } = oi(n, t, "tag:yaml.org,2002:seq"), a = {
					kind: "sequence",
					tag: e,
					style: r,
					anchor: i,
					items: []
				};
				n.frames.push({
					kind: "sequence",
					node: a
				});
				break;
			}
			case x.MAPPING: {
				let { tag: e, style: r, anchor: i } = oi(n, t, "tag:yaml.org,2002:map"), a = {
					kind: "mapping",
					tag: e,
					style: r,
					anchor: i,
					items: []
				};
				n.frames.push({
					kind: "mapping",
					node: a,
					key: null
				});
				break;
			}
			case x.ALIAS: {
				let e = n.source.slice(t.anchorStart, t.anchorEnd);
				si(n, {
					kind: "alias",
					tag: "",
					style: new W(),
					anchor: e
				});
				break;
			}
			case x.POP: {
				let e = n.frames.pop();
				if (e.kind === "mapping" && e.key) throw Error("incomplete mapping pair in event stream");
				e.kind === "document" ? n.documents.push(e.doc) : si(n, e.node);
				break;
			}
		}
	}
	return n.documents;
}
//#endregion
//#region src/index.ts
var li = x.DOCUMENT, ui = x.SEQUENCE, di = x.MAPPING, fi = x.SCALAR, pi = x.ALIAS, mi = x.POP, hi = S.PLAIN, gi = S.SINGLE_QUOTED, _i = S.DOUBLE_QUOTED, vi = S.LITERAL_BLOCK, yi = S.FOLDED_BLOCK, bi = C.BLOCK, xi = C.FLOW, Si = w.CLIP, Ci = w.STRIP, wi = w.KEEP;
//#endregion
export { Si as CHOMPING_CLIP, wi as CHOMPING_KEEP, w as CHOMPING_MODE, Ci as CHOMPING_STRIP, C as COLLECTION_STYLE, bi as COLLECTION_STYLE_BLOCK, xi as COLLECTION_STYLE_FLOW, rt as CORE_SCHEMA, at as DUMP_SCHEMA, pi as EVENT_ALIAS, li as EVENT_DOCUMENT, x as EVENT_ID, di as EVENT_MAPPING, mi as EVENT_POP, fi as EVENT_SCALAR, ui as EVENT_SEQUENCE, tt as FAILSAFE_SCHEMA, nt as JSON_SCHEMA, e as NOT_RESOLVED, S as SCALAR_STYLE, _i as SCALAR_STYLE_DOUBLE_QUOTED, yi as SCALAR_STYLE_FOLDED_BLOCK, vi as SCALAR_STYLE_LITERAL_BLOCK, hi as SCALAR_STYLE_PLAIN, gi as SCALAR_STYLE_SINGLE_QUOTED, y as Schema, W as Style, Vn as VISIT_BREAK, Hn as VISIT_SKIP, it as YAML11_SCHEMA, b as YAMLException, Ie as binaryTag, f as boolCoreTag, h as boolJsonTag, ne as boolYaml11Tag, Wt as constructFromEvents, r as defineMappingTag, t as defineScalarTag, n as defineSequenceTag, ti as dump, ci as eventsToAst, xe as floatCoreTag, Ee as floatJsonTag, je as floatYaml11Tag, Dt as getScalarValue, se as intCoreTag, fe as intJsonTag, ge as intYaml11Tag, Bn as jsToAst, ct as legacyMapTag, In as load, Fn as loadAll, qe as mapTag, Me as mergeTag, o as nullCoreTag, s as nullJsonTag, l as nullYaml11Tag, Ge as omapTag, Ke as pairsTag, Mn as parseEvents, $r as present, ot as realMapTag, He as seqTag, Je as setTag, i as strTag, Ve as timestampTag, Wn as visit };
