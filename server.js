const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const D = path.join(__dirname, 'data');
const U = path.join(D, 'uploads');
const PUB = path.join(__dirname, 'public');
const DBF = path.join(D, 'db.json');
fs.mkdirSync(U, { recursive: true });
let db = fs.existsSync(DBF) ? JSON.parse(fs.readFileSync(DBF)) : {
	users: [], items: [], messages: [], sessions: {}
};
const save = () => {
	fs.writeFileSync(DBF + '.tmp', JSON.stringify(db));
	fs.renameSync(DBF + '.tmp', DBF);
};
const uid = () => crypto.randomBytes(6).toString('hex');
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
const CATS = ['Bags', 'Electronics', 'Keys', 'IDs & Cards', 'Clothing', 'Books', 'Other'];
if (!db.users.length) {
	const s = uid();
	db.users.push({
		id: 'seed', name: 'FindIt Team', email: 'team@findit.local', salt: s, hash: hash(uid(), s)
	});
	[['found', 'Black backpack', 'Left near the library entrance, has a laptop sleeve inside.', 'Bags', 'Main Library'], ['lost', 'Student ID card', 'Blue lanyard, name starts with A.', 'IDs & Cards', 'Cafeteria'], ['found', 'Set of keys', 'Three keys and a small red fox keychain.', 'Keys', 'Lecture hall 2'], ['lost', 'White earbuds case', 'Lost after the evening lecture.', 'Electronics', 'Dormitory']]
		.forEach(([type, title, description, category, location], n) => db.items.push({
		id: uid(), type, title, description, category, location, date: new Date(Date.now() - n * 864e5).toISOString().slice(0, 10), status: 'open', photo: '', ownerId: 'seed', createdAt: Date.now() - n * 1e6
	}));
	save();
}
const send = (r, c, o, h = {}) => {
	r.writeHead(c, { 'Content-Type': 'application/json', ...h });
	r.end(JSON.stringify(o));
};
const bad = (r, m, c = 400) => send(r, c, { error: m });
const tries = {};
const pub = (i, me) => {
	const o = db.users.find(u => u.id === i.ownerId) || {};
	return {
		...i, ownerId: undefined, owner: o.name, ownerEmail: me ? o.email : undefined, mine: !!me && me.id === i.ownerId
	};
};
const T = {
	'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
http.createServer((req, res) => {
	const url = new URL(req.url, 'http://x');
	const p = url.pathname;
	if (!p.startsWith('/api/')) {
		const base = p.startsWith('/uploads/') ? U : PUB;
		const rel = p.startsWith('/uploads/') ? p.slice(9) : (p === '/' ? 'index.html' : p.slice(1));
		const f = path.join(base, path.normalize(rel));
		if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
			return bad(res, 'Not found', 404);
		}
		res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
		return fs.createReadStream(f).pipe(res);
	}
	let raw = '';
	req.on('data', c => {
		raw += c;
		if (raw.length > 7e6) {
			req.destroy();
		}
	});
	req.on('end', () => {
		try {
			const b = raw ? JSON.parse(raw) : {};
			const ck = Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]));
			const me = db.users.find(u => u.id === db.sessions[ck.sid]);
			const m = req.method;
			const s = p.slice(5).split('/');
			const str = (v, n) => String(v || '').trim().slice(0, n);
			const login = u => {
				const t = crypto.randomBytes(24).toString('hex');
				db.sessions[t] = u.id;
				save();
				return { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600` };
			};
			const safe = u => ({
				id: u.id, name: u.name, email: u.email
			});
			if (s[0] === 'me') {
				return send(res, 200, { user: me ? safe(me) : null, unread: me ? db.messages.filter(x => x.to === me.id && x.at > (me.lastRead || 0)).length : 0 });
			}
			if (s[0] === 'register' && m === 'POST') {
				const email = str(b.email, 100).toLowerCase();
				const name = str(b.name, 50);
				if (!name || !/^\S+@\S+\.\S+$/.test(email) || String(b.password || '').length < 6) {
					return bad(res, 'Enter a name, a valid email and a password of 6+ characters');
				}
				if (db.users.some(u => u.email === email)) {
					return bad(res, 'This email is already registered');
				}
				const salt = uid();
				const u = {
					id: uid(), name, email, salt, hash: hash(b.password, salt)
				};
				db.users.push(u);
				return send(res, 200, { user: safe(u) }, login(u));
			}
			if (s[0] === 'login' && m === 'POST') {
				const email = str(b.email, 100).toLowerCase();
				const k = req.socket.remoteAddress + email;
				tries[k] = (tries[k] || 0) + 1;
				setTimeout(() => delete tries[k], 6e5);
				const u = db.users.find(x => x.email === email);
				if (tries[k] > 10) {
					return bad(res, 'Too many attempts, wait a few minutes', 429);
				}
				if (!u || hash(String(b.password || ''), u.salt) !== u.hash) {
					return bad(res, 'Wrong email or password', 401);
				}
				return send(res, 200, { user: safe(u) }, login(u));
			}
			if (s[0] === 'logout') {
				delete db.sessions[ck.sid];
				save();
				return send(res, 200, { ok: 1 }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
			}
			if (s[0] === 'stats') {
				const c = (t) => db.items.filter(i => i.type === t && i.status === 'open').length;
				return send(res, 200, {
					lost: c('lost'), found: c('found'), reunited: db.items.filter(i => i.status === 'resolved').length
				});
			}
			if (s[0] === 'items' && !s[1] && m === 'GET') {
				const q = str(url.searchParams.get('q'), 80).toLowerCase().split(/\s+/).filter(Boolean);
				const ty = url.searchParams.get('type');
				const ca = url.searchParams.get('category');
				const st = url.searchParams.get('status');
				const mine = url.searchParams.get('mine');
				const l = db.items.filter(i => (!ty || i.type === ty) && (!ca || i.category === ca) && (st === 'all' || i.status === (st || 'open')) && (!mine || (me && i.ownerId === me.id)) && q.every(w => (i.title + ' ' + i.description + ' ' + i.location + ' ' + i.category).toLowerCase().includes(w))).sort((a, b) => b.createdAt - a.createdAt);
				return send(res, 200, l.map(i => pub(i, me)));
			}
			if (s[0] === 'items' && !s[1] && m === 'POST') {
				if (!me) {
					return bad(res, 'Please log in first', 401);
				}
				const it = {
					id: uid(), type: b.type === 'found' ? 'found' : 'lost', title: str(b.title, 80), description: str(b.description, 500), category: CATS.includes(b.category) ? b.category : 'Other', location: str(b.location, 80), date: str(b.date, 10), status: 'open', photo: '', ownerId: me.id, createdAt: Date.now()
				};
				if (!it.title || !it.location || !/^\d{4}-\d{2}-\d{2}$/.test(it.date)) {
					return bad(res, 'Title, location and date are required');
				}
				const mt = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(b.photo || '');
				if (mt) {
					const fn = it.id + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
					fs.writeFileSync(path.join(U, fn), Buffer.from(mt[2], 'base64'));
					it.photo = '/uploads/' + fn;
				}
				db.items.push(it);
				save();
				return send(res, 200, pub(it, me));
			}
			if (s[0] === 'items' && s[1]) {
				const it = db.items.find(i => i.id === s[1]);
				if (!it) {
					return bad(res, 'Item not found', 404);
				}
				if (m === 'GET') {
					return send(res, 200, pub(it, me));
				}
				if (!me || me.id !== it.ownerId) {
					return bad(res, 'Only the poster can do this', 403);
				}
				if (m === 'PATCH') {
					it.status = b.status === 'resolved' ? 'resolved' : 'open';
					save();
					return send(res, 200, pub(it, me));
				}
				if (m === 'DELETE') {
					db.items = db.items.filter(i => i !== it);
					if (it.photo) {
						fs.rmSync(path.join(U, path.basename(it.photo)), { force: true });
					}
					save();
					return send(res, 200, { ok: 1 });
				}
			}
			if (s[0] === 'messages') {
				if (!me) {
					return bad(res, 'Please log in first', 401);
				}
				if (m === 'GET') {
					const l = db.messages.filter(x => x.to === me.id || x.from === me.id).sort((a, b) => a.at - b.at).map(x => {
						const o = db.users.find(u => u.id === (x.from === me.id ? x.to : x.from)) || {};
						const i = db.items.find(i => i.id === x.itemId) || {};
						return {
							id: x.id, text: x.text, at: x.at, mine: x.from === me.id, withId: o.id, with: o.name, withEmail: o.email, item: i.title, itemId: x.itemId
						};
					});
					me.lastRead = Date.now();
					save();
					return send(res, 200, l);
				}
				if (m === 'POST') {
					const it = db.items.find(i => i.id === b.itemId);
					const t = str(b.text, 500);
					if (!it || !t) {
						return bad(res, 'Write a message first');
					}
					const owner = it.ownerId === me.id;
					const to = owner ? b.toId : it.ownerId;
					if (!db.users.some(u => u.id === to) || to === me.id || (owner && !db.messages.some(x => x.itemId === it.id && x.from === to && x.to === me.id))) {
						return bad(res, 'Cannot send this message');
					}
					db.messages.push({
						id: uid(), itemId: it.id, from: me.id, to, text: t, at: Date.now()
					});
					save();
					return send(res, 200, { ok: 1 });
				}
			}
			bad(res, 'Not found', 404);
		}
		catch (e) {
			console.error(e);
			bad(res, 'Server error', 500);
		}
	});
}).listen(PORT, () => console.log('FindIt Campus running at http://localhost:' + PORT));
