const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const api = async (u, m, b) => {
	const r = await fetch('/api/' + u, {
		method: m || 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined
	});
	const d = await r.json().catch(() => ({}));
	if (!r.ok) {
		throw new Error(d.error || 'Error');
	}
	return d;
};
const CATS = {
	Bags: '🎒', Electronics: '📱', Keys: '🔑', 'IDs & Cards': '🪪', Clothing: '👕', Books: '📚', Other: '📦'
};
let me = null;
let f = {
	q: '', type: '', category: '', mine: ''
};
let tm;
const toast = t => {
	const e = $('#toast');
	e.textContent = t;
	e.style.display = 'block';
	clearTimeout(tm);
	tm = setTimeout(() => e.style.display = 'none', 2600);
};
const open = h => {
	$('#dbody').innerHTML = h;
	if (!dlg.open) {
		dlg.showModal();
	}
};
document.addEventListener('mousemove', e => {
	document.body.style.setProperty('--mx', e.clientX + 'px');
	document.body.style.setProperty('--my', e.clientY + 'px');
});
async function boot() {
	const d = await api('me');
	me = d.user;
	$('#bAuth').textContent = me ? 'Log out (' + me.name.split(' ')[0] + ')' : 'Log in';
	$('#badge').textContent = d.unread || '';
	const s = await api('stats');
	$('#sLost').textContent = s.lost;
	$('#sFound').textContent = s.found;
	$('#sRe').textContent = s.reunited;
	load();
}
async function load() {
	const p = new URLSearchParams({
		q: f.q, type: f.type, category: f.category, status: $('#done').checked ? 'all' : 'open'
	});
	if (f.mine) {
		p.set('mine', 1);
	}
	const l = await api('items?' + p);
	$('#grid').innerHTML = l.length ? l.map(i => `<article class="tag ${i.type} ${i.status}" style="--r:${(parseInt(i.id.slice(0, 2), 16) % 5 - 2) * .8}deg" data-id="${i.id}"><span class="stamp">${i.status === 'resolved' ? 'REUNITED' : i.type.toUpperCase()}</span><div class="ph" ${i.photo ? `style="background-image:url(${esc(i.photo)})"` : ''}>${i.photo ? '' : CATS[i.category]}</div><h3>${esc(i.title)}</h3><div class="meta">${esc(i.location)} · ${esc(i.date)}</div></article>`).join('') : '<p class="empty">Nothing here yet. Try another search or report an item.</p>';
}
$('#chips').innerHTML = ['All', ...Object.keys(CATS)].map(c => `<button class="${(f.category || 'All') === c ? 'on' : ''}">${c}</button>`).join('');
$('#chips').onclick = e => {
	if (e.target.tagName === 'BUTTON') {
		f.category = e.target.textContent === 'All' ? '' : e.target.textContent;
		load();
	}
};
$('#types').onclick = e => {
	if (e.target.dataset.v !== undefined) {
		f.type = e.target.dataset.v;
		document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', b === e.target));
		load();
	}
};
let qt;
$('#q').oninput = e => {
	clearTimeout(qt);
	qt = setTimeout(() => {
		f.q = e.target.value;
		load();
	}, 250);
};
$('#done').onchange = load;
$('#grid').onclick = e => {
	const c = e.target.closest('.tag');
	if (c) {
		item(c.dataset.id);
	}
};
async function item(id) {
	const i = await api('items/' + id);
	let a;
	if (i.mine)
		a = `<button class="btn dark" id="rs">${i.status === 'open' ? 'Mark as reunited ✓' : 'Re-open'}</button> <button class="btn" style="color:#b3261e;border-color:#b3261e" id="del">Delete</button>`;
	else if (!me)
		a = '<p>Log in to contact the poster.</p><button class="btn dark" onclick="auth()">Log in / Register</button>';
	else
		a = `<p class="meta">Posted by ${esc(i.owner)} · <a href="mailto:${esc(i.ownerEmail)}">${esc(i.ownerEmail)}</a></p><textarea id="mt" rows="3" maxlength="500" placeholder="Hi! I think this is mine / I have your item…"></textarea><button class="btn dark" id="sm">Send message</button>`;
	open(`${i.photo ? `<img class="dimg" src="${esc(i.photo)}">` : ''}<p class="meta">${i.type} · ${esc(i.category)} · ${esc(i.date)} · ${i.status === 'resolved' ? 'reunited' : 'open'}</p><h2>${esc(i.title)}</h2><p>${esc(i.description) || 'No description.'}</p><p class="meta">📍 ${esc(i.location)}</p><hr>${a}`);
	const g = x => document.getElementById(x);
	if (g('rs')) {
		g('rs').onclick = async () => {
			await api('items/' + id, 'PATCH', { status: i.status === 'open' ? 'resolved' : 'open' });
			dlg.close();
			boot();
		};
	}
	if (g('del')) {
		g('del').onclick = async () => {
			if (confirm('Delete this post?')) {
				await api('items/' + id, 'DELETE');
				dlg.close();
				toast('Deleted');
				boot();
			}
		};
	}
	if (g('sm')) {
		g('sm').onclick = async () => {
			try {
				await api('messages', 'POST', { itemId: id, text: g('mt').value });
				dlg.close();
				toast('Message sent to the poster');
			}
			catch (e) {
				toast(e.message);
			}
		};
	}
}
function auth() {
	let reg = false;
	const draw = () => {
		open(`<h2>${reg ? 'Create account' : 'Welcome back'}</h2><form id="af">${reg ? '<label>Name</label><input name="name" required>' : ''}<label>Email</label><input name="email" type="email" required><label>Password (6+ chars)</label><input name="password" type="password" minlength="6" required><div class="err" id="er"></div><button class="btn dark full">${reg ? 'Register' : 'Log in'}</button></form><p><a href="#" id="sw">${reg ? 'I already have an account' : 'New here? Create an account'}</a></p>`);
		$('#sw').onclick = e => {
			e.preventDefault();
			reg = !reg;
			draw();
		};
		$('#af').onsubmit = async (e) => {
			e.preventDefault();
			try {
				await api(reg ? 'register' : 'login', 'POST', Object.fromEntries(new FormData(e.target)));
				dlg.close();
				toast('Welcome!');
				boot();
			}
			catch (x) {
				$('#er').textContent = x.message;
			}
		};
	};
	draw();
}
$('#bAuth').onclick = async () => {
	if (me) {
		await api('logout', 'POST');
		toast('Logged out');
		f.mine = '';
		boot();
	}
	else
		auth();
};
$('#bMine').onclick = () => {
	if (!me) {
		return auth();
	}
	f.mine = f.mine ? '' : '1';
	$('#bMine').textContent = f.mine ? 'All posts' : 'My posts';
	load();
};
async function inbox(sel) {
	const l = await api('messages');
	const th = {};
	l.forEach(m => {
		const k = m.itemId + '|' + m.withId;
		(th[k] = th[k] || []).push(m);
	});
	const last = k => th[k][th[k].length - 1].at;
	const keys = Object.keys(th).sort((a, b) => last(b) - last(a));
	$('#badge').textContent = '';
	const t = sel && th[sel];
	const list = keys.map(k => `<div class="msg thread ${k === sel ? 'cur' : ''}" data-k="${esc(k)}"><b>${esc(th[k][0].with)}</b> about <i>${esc(th[k][0].item)}</i></div>`).join('') || '<p>No messages yet. Open an item and contact the poster.</p>';
	const conv = t ? `<div class="conv">${t.map(m => `<div class="bub ${m.mine ? 'me' : ''}">${esc(m.text)}<small>${new Date(m.at).toLocaleString()}</small></div>`).join('')}</div><textarea id="rt" rows="2" maxlength="500" placeholder="Write a reply..."></textarea><button class="btn dark" id="rb">Send reply</button> <a href="mailto:${esc(t[0].withEmail)}">or email</a>` : '';
	open(`<h2>Inbox</h2>${list}${conv}`);
	document.querySelectorAll('.thread').forEach(e => e.onclick = () => inbox(e.dataset.k));
	if (t) {
		$('#rb').onclick = async () => {
			try {
				const p = sel.split('|');
				await api('messages', 'POST', {
					itemId: p[0], toId: p[1], text: $('#rt').value
				});
				inbox(sel);
			}
			catch (e) {
				toast(e.message);
			}
		};
	}
}
$('#bInbox').onclick = () => {
	if (!me) {
		return auth();
	}
	inbox();
};
function about() {
	const ms = [['Week 1-2', 'Requirements & Planning'], ['Week 3', 'UI/UX Design complete'], ['Week 3', 'Backend & Database'], ['Week 3', 'Frontend integrated'], ['Week 3-4', 'Testing & Debugging'], ['Week 5', 'Final demo & report']];
	const team = [['Arlan Aidarov', 'Project Planning'], ['Ramazan Ashirbek', 'UI/UX Design'], ['Bakyt Kuanysh', 'Backend Development'], ['Kairat Bulatov', 'Frontend Development']];
	open(`<h2>About FindIt Campus</h2><p>Lost items are reported through chats and posters, and found items pile up in random offices. FindIt Campus gives students one shared place to report, search and connect.</p><h3>Milestones</h3><ol class="tl">${ms.map(m => `<li><b>${esc(m[0])}</b> ${esc(m[1])}</li>`).join('')}</ol><h3>Team</h3><ul>${team.map(m => `<li>${esc(m[0])}, ${esc(m[1])}</li>`).join('')}</ul><h3>Not included (for now)</h3><p>University system integration, automated matching, and a native mobile app.</p><p class="meta">Astana IT University · Project Management course</p>`);
}
$('#bAbout').onclick = () => {};
$('#bReport').onclick = () => {
	if (!me) {
		return auth();
	}
	const t0 = Date.now();
	let ph = '';
	open(`<h2>Report an item</h2><span class="meta">⏱ <b id="sw2">0</b>s · aim for under a minute</span><form id="rf"><div class="row"><div><label>Type</label><select name="type"><option value="lost">I lost something</option><option value="found">I found something</option></select></div><div><label>Category</label><select name="category">${Object.keys(CATS).map(c => `<option>${c}</option>`)}</select></div></div><label>Title</label><input name="title" maxlength="80" required><label>Description</label><textarea name="description" rows="3" maxlength="500"></textarea><div class="row"><div><label>Location</label><input name="location" list="locs" required><datalist id="locs"><option>Main Library<option>Cafeteria<option>Dormitory<option>Lecture hall<option>Gym<option>Parking</datalist></div><div><label>Date</label><input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}"></div></div><label>Photo (optional)</label><input type="file" id="ph" accept="image/*"><div class="err" id="er"></div><button class="btn dark full">Post item</button></form>`);
	const iv = setInterval(() => {
		const e = $('#sw2');
		e ? e.textContent = Math.round((Date.now() - t0) / 1000) : clearInterval(iv);
	}, 500);
	$('#ph').onchange = e => {
		const fl = e.target.files[0];
		if (!fl) {
			return;
		}
		const im = new Image();
		im.onload = () => {
			const k = Math.min(1, 800 / Math.max(im.width, im.height));
			const c = document.createElement('canvas');
			c.width = im.width * k;
			c.height = im.height * k;
			c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
			ph = c.toDataURL('image/jpeg', .8);
		};
		im.src = URL.createObjectURL(fl);
	};
	$('#rf').onsubmit = async (e) => {
		e.preventDefault();
		try {
			await api('items', 'POST', { ...Object.fromEntries(new FormData(e.target)), photo: ph });
			dlg.close();
			toast('Posted!');
			boot();
		}
		catch (x) {
			$('#er').textContent = x.message;
		}
	};
};
boot();
