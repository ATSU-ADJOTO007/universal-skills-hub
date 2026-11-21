/* Universal Skills Hub - renderer. Plain JavaScript, no framework. */

(function () {
  'use strict';
  const { el, icon, button, toast, modal, confirmDialog, fmtDate, fmtSize, field, select, renderDiff, busy } = window.UI;
  const t = (...a) => window.t(...a);
  const call = (m, ...a) => window.ush.call(m, ...a);

  const state = {
    view: 'dashboard',
    settings: null,
    categories: [],
    packs: [],
    adapters: [],
    filters: { query: '', category: '', tag: '', packId: '', agentId: '', status: '', security: '', sort: 'relevance' },
    selectedSkill: null,
    skillTab: 'overview',
    selectedPack: null,
    counts: {}
  };

  const NAV = [
    ['dashboard', 'dashboard'], ['library', 'library'], ['packs', 'packs'], ['agents', 'agents'],
    ['sources', 'sources'], ['history', 'history'], ['security', 'security'], ['settings', 'settings']
  ];

  const view = () => document.getElementById('view');

  function catLabel(id) {
    return state.categories.find((c) => c.id === id)?.label || id;
  }

  function statusBadge(s) {
    const cls = { active: 'ok', 'pending-review': 'warn', incomplete: 'info', archived: '' }[s] ?? '';
    return el('span', { class: `badge ${cls}`, text: t(`status.${s}`) });
  }

  function secBadge(level) {
    const cls = { none: 'ok', low: 'info', medium: 'warn', high: 'bad' }[level] ?? '';
    return el('span', { class: `badge ${cls}`, title: t('security.level'), text: t(`sec.${level || 'none'}`) });
  }

  function compatBadge(level) {
    const cls = { native: 'ok', adapter: 'accent', manual: 'info', unverified: 'warn' }[level] ?? '';
    return el('span', { class: `badge ${cls}`, text: t(`compat.${level}`) });
  }

  function errorBox(err) {
    return el('div', { class: 'notice bad', text: err.message || String(err) });
  }

  async function safe(fn, okMsg) {
    try {
      const r = await fn();
      if (okMsg) toast(okMsg, 'ok');
      return r;
    } catch (err) {
      toast(err.message || String(err), 'bad');
      return undefined;
    }
  }

  // ---------------------------------------------------------------- layout

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.replaceChildren(...NAV.map(([id, ic]) => {
      const count = state.counts[id];
      return el('button', { class: 'nav-item', type: 'button', 'aria-current': state.view === id ? 'page' : null, onclick: () => go(id) },
        icon(ic), t(`nav.${id}`),
        count ? el('span', { class: `nav-count ${['security', 'agents'].includes(id) ? 'alert' : ''}`, text: count }) : null);
    }));
    document.getElementById('global-search').placeholder = t('search.placeholder');
  }

  function renderTopbar() {
    const bar = document.getElementById('topbar-actions');
    bar.replaceChildren(
      button(t('action.import'), () => openImport(), { iconName: 'import' }),
      button(t('action.scanAll'), async (e) => {
        await busy(e.currentTarget, async () => {
          const srcs = await call('listSources');
          let n = 0;
          for (const s of srcs) if (!s.paused) {
            const r = await safe(() => call('scan', s.id));
            if (r) n += r.summary.new + r.summary.modified;
          }
          toast(t('toast.scanDone', { n }), 'ok');
          refreshCounts();
          if (state.view === 'sources' || state.view === 'dashboard') render();
        });
      }, { iconName: 'scan' })
    );
  }

  async function refreshCounts() {
    try {
      const d = await call('dashboard');
      state.counts = { library: d.skills, packs: d.packs, security: d.securityAlerts || 0, agents: d.conflicts || 0 };
      renderNav();
      document.getElementById('sidebar-foot').textContent = `${d.skills} ${t('word.skills')} - ${d.packs} ${t('word.packs')}`;
    } catch {
      // counts are optional
    }
  }

  function go(id) {
    state.view = id;
    if (location.hash !== `#${id}`) location.hash = id;
    render();
  }

  async function render() {
    renderNav();
    const v = view();
    v.replaceChildren(el('div', { class: 'row muted' }, el('span', { class: 'spinner' }), t('loading')));
    try {
      const fn = VIEWS[state.view] || VIEWS.dashboard;
      const content = await fn();
      v.replaceChildren(content);
    } catch (err) {
      v.replaceChildren(errorBox(err));
    }
  }

  function pageHead(title, subtitle, actions = []) {
    return el('div', { class: 'page-head' },
      el('div', null, el('h1', { text: title }), subtitle ? el('p', { text: subtitle }) : null),
      el('div', { class: 'actions' }, actions));
  }

  // ------------------------------------------------------------- dashboard

  async function viewDashboard() {
    const d = await call('dashboard');
    const tile = (num, lbl, target, cls = '') => el('button', { class: `tile ${cls}`, type: 'button', onclick: () => go(target) }, el('span', { class: 'num', text: num }), el('span', { class: 'lbl', text: lbl }));
    const maxCat = Math.max(1, ...d.byCategory.map((c) => c.count));
    return el('div', { class: 'stack' },
      pageHead(t('nav.dashboard'), t('dash.subtitle'), [
        button(t('action.import'), () => openImport(), { iconName: 'import', kind: 'primary' }),
        button(t('packs.smart'), () => openSmartPack(), { iconName: 'sparkle' }),
        button(t('backup.create'), async (e) => busy(e.currentTarget, async () => {
          const r = await safe(() => call('createBackup', null, {}));
          if (r) toast(t('backup.created', { file: r.file }), 'ok');
        }), { iconName: 'backup' })
      ]),
      el('div', { class: 'grid tiles' },
        tile(d.skills, t('dash.skills'), 'library'),
        tile(d.packs, t('dash.packs'), 'packs'),
        tile(d.agents, t('dash.agents'), 'agents'),
        tile(d.sources, t('dash.sources'), 'sources'),
        tile(d.newDetected, t('dash.newDetected'), 'sources', d.newDetected ? 'warn' : ''),
        tile(d.pendingChanges, t('dash.pending'), 'sources', d.pendingChanges ? 'warn' : ''),
        tile(d.syncs, t('dash.syncs'), 'history'),
        tile(d.errors, t('dash.errors'), 'history', d.errors ? 'bad' : ''),
        tile(d.conflicts, t('dash.conflicts'), 'agents', d.conflicts ? 'bad' : ''),
        tile(d.securityAlerts, t('dash.security'), 'security', d.securityAlerts ? 'warn' : '')
      ),
      el('div', { class: 'grid two' },
        el('div', { class: 'card' }, el('h2', { text: t('dash.byCategory') }),
          d.byCategory.length ? el('div', { class: 'stack' }, d.byCategory.slice(0, 12).map((c) => el('div', null,
            el('div', { class: 'row small' }, el('a', { href: '#library', onclick: (e) => { e.preventDefault(); state.filters.category = c.id; go('library'); }, text: c.label }), el('span', { class: 'right muted', text: c.count })),
            el('div', { class: 'bar' }, el('span', { style: `width:${Math.round((c.count / maxCat) * 100)}%` }))
          ))) : emptyLibrary()),
        el('div', { class: 'card' }, el('h2', { text: t('dash.recent') }),
          d.recent.length ? el('div', { class: 'stack small' }, d.recent.map((h) => el('div', null, el('div', { text: h.message }), el('div', { class: 'muted', text: `${fmtDate(h.ts)} - ${h.type}` })))) : el('p', { class: 'muted', text: t('history.empty') }))
      ),
      el('div', { class: 'card' }, el('h2', { text: t('dash.status') }),
        el('div', { class: 'row' }, Object.entries(d.byStatus).map(([k, v]) => el('span', { class: 'row small' }, statusBadge(k), String(v)))))
    );
  }

  function emptyLibrary() {
    return el('div', { class: 'empty' }, el('h3', { text: t('library.emptyTitle') }), el('p', { text: t('library.emptyText') }),
      el('div', { class: 'row', style: 'justify-content:center' }, button(t('action.import'), () => openImport(), { kind: 'primary', iconName: 'import' }), button(t('sources.add'), () => go('sources'), { iconName: 'folder' })));
  }

  // --------------------------------------------------------------- library

  async function viewLibrary() {
    const f = state.filters;
    const skills = await call('search', { ...f, category: f.category || null, tag: f.tag || null, packId: f.packId || null, agentId: f.agentId || null, status: f.status || null, security: f.security || null });
    const allTags = [...new Set((await call('search', {})).flatMap((s) => s.tags || []))].sort();
    const filter = (key, options) => select([{ value: '', label: t(`filter.${key}`) }, ...options], f[key], (v) => { f[key] = v; render(); }, { 'aria-label': t(`filter.${key}`) });
    const toolbar = el('div', { class: 'toolbar' },
      filter('category', state.categories.map((c) => ({ value: c.id, label: c.label }))),
      filter('tag', allTags.map((x) => ({ value: x, label: x }))),
      filter('packId', state.packs.map((p) => ({ value: p.id, label: p.name }))),
      filter('agentId', state.adapters.map((a) => ({ value: a.id, label: a.label }))),
      filter('status', ['active', 'pending-review', 'incomplete', 'archived'].map((s) => ({ value: s, label: t(`status.${s}`) }))),
      filter('security', ['none', 'low', 'medium', 'high'].map((s) => ({ value: s, label: t(`sec.${s}`) }))),
      select(['relevance', 'name', 'updated', 'imported'].map((s) => ({ value: s, label: t(`sort.${s}`) })), f.sort, (v) => { f.sort = v; render(); }, { 'aria-label': t('sort.label') }),
      Object.entries(f).some(([k, v]) => k !== 'sort' && v) ? button(t('filter.reset'), () => { Object.assign(f, { query: '', category: '', tag: '', packId: '', agentId: '', status: '', security: '' }); document.getElementById('global-search').value = ''; render(); }, { kind: 'ghost', size: 'sm' }) : null
    );
    const list = el('div', { class: 'list' }, skills.map((s) => el('div', { class: `list-row ${state.selectedSkill === s.id ? 'active' : ''}`, dataset: { id: s.id }, tabindex: '0', onclick: () => selectSkill(s.id), onkeydown: (e) => { if (e.key === 'Enter') selectSkill(s.id); } },
      el('div', { style: 'min-width:0' },
        el('div', { class: 'title', text: s.name }),
        el('div', { class: 'desc', text: s.description || t('skill.noDescription') }),
        el('div', { class: 'row small', style: 'margin-top:4px' }, s.categories.slice(0, 3).map((c) => el('span', { class: 'chip', text: catLabel(c) })), (s.tags || []).slice(0, 3).map((x) => el('span', { class: 'chip muted', text: `#${x}` })))
      ),
      el('div', { class: 'stack', style: 'align-items:flex-end;gap:4px' }, statusBadge(s.status), secBadge(s.security?.level), el('span', { class: 'small muted', text: `v${s.currentVersion}` }))
    )));
    const detail = el('div', { id: 'skill-detail', class: 'panel sticky' }, el('div', { class: 'empty', text: t('library.selectHint') }));
    const content = el('div', { class: 'stack' },
      pageHead(t('nav.library'), t('library.count', { n: skills.length }), [
        button(t('library.duplicates'), () => openDuplicates(), { iconName: 'copy' }),
        button(t('library.trash'), () => openTrash(), { iconName: 'trash' }),
        button(t('action.import'), () => openImport(), { iconName: 'import', kind: 'primary' })
      ]),
      toolbar,
      skills.length ? el('div', { class: 'split' }, el('div', { class: 'panel' }, list), detail) : (f.query || f.category || f.tag || f.packId || f.agentId || f.status || f.security ? el('div', { class: 'empty', text: t('library.noMatch') }) : emptyLibrary())
    );
    if (state.selectedSkill && skills.some((s) => s.id === state.selectedSkill)) setTimeout(() => renderSkillDetail(state.selectedSkill), 0);
    return content;
  }

  function selectSkill(id) {
    state.selectedSkill = id;
    document.querySelectorAll('.list-row').forEach((r) => r.classList.toggle('active', r.dataset.id === id));
    renderSkillDetail(id);
  }

  async function renderSkillDetail(id) {
    const box = document.getElementById('skill-detail');
    if (!box) return;
    let data;
    try {
      data = await call('getSkill', id);
    } catch (err) {
      box.replaceChildren(errorBox(err));
      return;
    }
    const s = data.skill;
    const tabs = ['overview', 'instructions', 'files', 'versions', 'security', 'install'];
    const body = el('div', { class: 'panel-body' });
    const tabBar = el('div', { class: 'tabs', role: 'tablist' }, tabs.map((tab) => el('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': state.skillTab === tab ? 'true' : 'false', onclick: () => { state.skillTab = tab; renderSkillDetail(id); }, text: t(`skill.tab.${tab}`) })));
    const head = el('div', { class: 'panel-head' },
      el('div', { style: 'min-width:0' }, el('h2', { style: 'margin:0', text: s.name }), el('div', { class: 'small muted', text: `${s.slug} - v${s.currentVersion}${s.label ? ` (${s.label})` : ''}` })),
      el('div', { class: 'row right' }, statusBadge(s.status), secBadge(s.security?.level)));
    box.replaceChildren(head, tabBar, body);
    const tab = state.skillTab;
    if (tab === 'overview') body.append(skillOverview(s, data));
    if (tab === 'instructions') body.append(skillInstructions(s, data));
    if (tab === 'files') body.append(await skillFiles(s));
    if (tab === 'versions') body.append(skillVersions(s));
    if (tab === 'security') body.append(skillSecurity(s));
    if (tab === 'install') body.append(await skillInstall(s));
  }

  function skillOverview(s, data) {
    const tagsInput = el('input', { type: 'text', value: (s.tags || []).join(', ') });
    const notes = el('textarea', { text: s.notes || '', style: 'font-family:var(--font);min-height:70px' });
    notes.value = s.notes || '';
    const prio = el('input', { type: 'number', value: s.priority || 0, min: '-5', max: '5', style: 'width:90px' });
    const status = select(['active', 'pending-review', 'incomplete', 'archived'].map((x) => ({ value: x, label: t(`status.${x}`) })), s.status);
    const cats = new Set(s.categories);
    const catBox = el('div', { class: 'row' }, state.categories.map((c) => el('label', { class: 'check chip' }, el('input', { type: 'checkbox', checked: cats.has(c.id), onchange: (e) => { if (e.target.checked) cats.add(c.id); else cats.delete(c.id); } }), c.label)));
    const conf = s.classification || {};
    return el('div', { class: 'stack' },
      el('p', { style: 'margin:0', text: s.description || t('skill.noDescription') }),
      (s.warnings || []).length ? el('div', { class: 'notice warn' }, s.warnings.map((w) => el('div', { text: w }))) : null,
      s.origin?.missing ? el('div', { class: 'notice warn', text: t('skill.originMissing') }) : null,
      el('dl', { class: 'kv' },
        el('dt', { text: t('skill.id') }), el('dd', { class: 'mono', text: s.id }),
        el('dt', { text: t('skill.origin') }), el('dd', { text: `${t(`origin.${s.origin?.type || 'folder'}`)}${s.origin?.path ? ` - ${s.origin.path}` : ''}${s.origin?.url ? ` - ${s.origin.url}` : ''}` }),
        el('dt', { text: t('skill.author') }), el('dd', { text: s.author || '-' }),
        el('dt', { text: t('skill.license') }), el('dd', { text: s.license || '-' }),
        el('dt', { text: t('skill.imported') }), el('dd', { text: fmtDate(s.importedAt) }),
        el('dt', { text: t('skill.updated') }), el('dd', { text: fmtDate(s.updatedAt) }),
        el('dt', { text: t('skill.packs') }), el('dd', { text: data.packs.map((p) => p.name).join(', ') || '-' }),
        el('dt', { text: t('skill.dependencies') }), el('dd', { text: (s.dependencies || []).join(', ') || '-' }),
        el('dt', { text: t('skill.tools') }), el('dd', { text: (s.allowedTools || []).join(', ') || '-' }),
        el('dt', { text: t('skill.installedAt') }), el('dd', { text: (s.installations || []).map((i) => i.path).join('\n') || '-' }),
        el('dt', { text: t('skill.classification') }), el('dd', null, conf.source === 'user' ? t('class.user') : t('class.auto', { c: Math.round((conf.confidence || 0) * 100) }), conf.uncertain ? el('span', { class: 'badge warn', style: 'margin-left:6px', text: t('class.uncertain') }) : null)
      ),
      (s.relations || []).length ? el('div', { class: 'notice' }, el('strong', { text: t('skill.related') }), s.relations.map((r) => el('div', { class: 'small', text: `${t(`rel.${r.relation}`)} (${Math.round(r.similarity * 100)} %) : ${state.skillNames?.[r.skillId] || r.skillId}` }))) : null,
      field(t('skill.categories'), catBox),
      field(t('skill.tags'), tagsInput, t('skill.tagsHint')),
      el('div', { class: 'row' }, field(t('skill.priority'), prio), field(t('skill.status'), status)),
      field(t('skill.notes'), notes),
      el('div', { class: 'row' },
        button(t('save'), async (e) => busy(e.currentTarget, async () => {
          await safe(() => call('updateMeta', s.id, { tags: tagsInput.value.split(',').map((x) => x.trim()).filter(Boolean), notes: notes.value, priority: Number(prio.value) || 0, status: status.value, categories: [...cats] }), t('saved'));
          render();
        }), { kind: 'primary', iconName: 'check' }),
        button(t('skill.reclassify'), async () => { await safe(() => call('reclassify', s.id), t('saved')); render(); }, { iconName: 'sparkle' }),
        button(t('skill.reveal'), () => window.ush.reveal(s.installations?.[0]?.path || s.origin?.path || ''), { iconName: 'folder', disabled: !(s.installations?.[0]?.path || s.origin?.path) }),
        exportMenu(s),
        button(t('delete'), async () => {
          if (!(await confirmDialog(t('skill.deleteConfirm', { name: s.name }), t('skill.deleteDetail'), { danger: true }))) return;
          await safe(() => call('removeSkill', s.id), t('skill.deleted'));
          state.selectedSkill = null;
          render();
          refreshCounts();
        }, { kind: 'danger', iconName: 'trash' })
      )
    );
  }

  function exportMenu(s) {
    return button(t('action.export'), () => {
      const fmt = select([{ value: 'zip', label: t('export.zip') }, { value: 'folder', label: t('export.folder') }, { value: 'markdown', label: t('export.markdown') }], 'zip');
      modal({
        title: t('export.title', { name: s.name }),
        body: el('div', { class: 'stack' }, field(t('export.format'), fmt), el('p', { class: 'small muted', text: t('export.hint') })),
        footer: (close) => [button(t('cancel'), close), button(t('export.choose'), async (e) => {
          const dir = await window.ush.dialog('folder', { title: t('export.choose') });
          if (!dir) return;
          await busy(e.currentTarget, async () => {
            const out = await safe(() => call('exportSkill', s.id, dir, fmt.value));
            if (out) {
              toast(t('export.done', { path: out }), 'ok');
              close();
            }
          });
        }, { kind: 'primary' })]
      });
    }, { iconName: 'export' });
  }

  function skillInstructions(s, data) {
    const ta = el('textarea', { class: 'editor', spellcheck: 'false' });
    ta.value = data.instructions;
    const note = el('input', { type: 'text', placeholder: t('skill.editNote') });
    return el('div', { class: 'stack' },
      el('div', { class: 'notice', text: t('skill.editInfo') }),
      ta,
      el('div', { class: 'row' }, note,
        button(t('skill.saveVersion'), async (e) => busy(e.currentTarget, async () => {
          if (ta.value === data.instructions) return toast(t('skill.noChange'));
          const r = await safe(() => call('editInstructions', s.id, ta.value, note.value || t('skill.manualEdit')));
          if (r?.changed) toast(t('skill.newVersion', { n: r.version }), 'ok');
          renderSkillDetail(s.id);
        }), { kind: 'primary', iconName: 'check' }))
    );
  }

  async function skillFiles(s) {
    const pre = el('pre', { class: 'code', text: t('skill.pickFile') });
    const rows = s.files.map((f) => el('tr', null,
      el('td', null, el('a', { href: '#', onclick: async (e) => {
        e.preventDefault();
        if (f.binary) { pre.textContent = t('skill.binary'); return; }
        pre.textContent = (await safe(() => call('readFile', s.id, f.path))) ?? '';
      }, text: f.path })),
      el('td', null, el('span', { class: `badge ${f.kind === 'executable' ? 'bad' : f.kind === 'script' ? 'warn' : ''}`, text: t(`kind.${f.kind}`) })),
      el('td', { class: 'small muted', text: fmtSize(f.size) })));
    return el('div', { class: 'stack' }, el('table', null, el('thead', null, el('tr', null, el('th', { text: t('file.path') }), el('th', { text: t('file.kind') }), el('th', { text: t('file.size') }))), el('tbody', null, rows)), el('div', { class: 'notice warn small', text: t('skill.noExec') }), pre);
  }

  function skillVersions(s) {
    const a = select(s.versions.map((v) => ({ value: v.n, label: `v${v.n}` })), Math.max(1, s.currentVersion - 1));
    const b = select(s.versions.map((v) => ({ value: v.n, label: `v${v.n}` })), s.currentVersion);
    const out = el('div', { class: 'stack' });
    return el('div', { class: 'stack' },
      el('table', null, el('thead', null, el('tr', null, el('th', { text: t('version') }), el('th', { text: t('date') }), el('th', { text: t('note') }), el('th'))),
        el('tbody', null, [...s.versions].reverse().map((v) => el('tr', null,
          el('td', { text: `v${v.n}${v.n === s.currentVersion ? ` (${t('current')})` : ''}` }),
          el('td', { class: 'small', text: fmtDate(v.createdAt) }),
          el('td', { class: 'small', text: `${v.note} [${v.source}]` }),
          el('td', null, v.n !== s.currentVersion ? button(t('restore'), async () => {
            if (!(await confirmDialog(t('version.restoreConfirm', { n: v.n }), t('version.restoreDetail')))) return;
            await safe(() => call('restoreVersion', s.id, v.n), t('version.restored'));
            renderSkillDetail(s.id);
          }, { size: 'sm' }) : null))))),
      s.versions.length > 1 ? el('div', { class: 'row' }, t('version.compare'), a, b, button(t('version.show'), async () => {
        const r = await safe(() => call('compareVersions', s.id, Number(a.value), Number(b.value)));
        if (!r) return;
        out.replaceChildren(...(r.files.length ? r.files.map((f) => el('div', { class: 'stack' }, el('h3', { text: `${f.path}${r.added.includes(f.path) ? ` (${t('diff.added')})` : r.removed.includes(f.path) ? ` (${t('diff.removed')})` : ''}` }), f.binary ? el('p', { class: 'muted', text: t('skill.binary') }) : renderDiff(f.diff))) : [el('p', { class: 'muted', text: t('version.same') })]));
      }, { iconName: 'eye' })) : el('p', { class: 'muted small', text: t('version.only') }),
      out
    );
  }

  function skillSecurity(s) {
    const sec = s.security || {};
    const comment = el('input', { type: 'text', placeholder: t('security.comment') });
    return el('div', { class: 'stack' },
      el('div', { class: 'row' }, t('security.level'), secBadge(sec.level), sec.reviewed ? el('span', { class: 'badge info', text: sec.approved ? t('security.approved') : t('security.refused') }) : el('span', { class: 'badge', text: t('security.notReviewed') })),
      (sec.findings || []).length ? el('table', null, el('thead', null, el('tr', null, el('th', { text: t('security.rule') }), el('th', { text: t('file.path') }), el('th', { text: t('security.excerpt') }))),
        el('tbody', null, sec.findings.map((f) => el('tr', null, el('td', null, secBadge(f.level), ' ', f.label), el('td', { class: 'mono', text: `${f.file}${f.line ? `:${f.line}` : ''}` }), el('td', { class: 'mono small', text: f.excerpt || '' }))))) : el('p', { class: 'muted', text: t('security.noFinding') }),
      el('div', { class: 'notice small', text: t('security.info') }),
      el('div', { class: 'row' }, comment,
        button(t('security.approve'), async () => { await safe(() => call('reviewSecurity', s.id, true, comment.value), t('saved')); render(); refreshCounts(); }, { kind: 'primary', iconName: 'check' }),
        button(t('security.refuse'), async () => { await safe(() => call('reviewSecurity', s.id, false, comment.value), t('saved')); render(); refreshCounts(); }, { kind: 'danger' }),
        button(t('security.rescan'), async () => { await safe(() => call('rescanSecurity', s.id), t('saved')); renderSkillDetail(s.id); }, { iconName: 'scan' }))
    );
  }

  async function skillInstall(s) {
    const dests = await call('listDestinations');
    const rows = dests.map((d) => {
      const linked = d.skillIds.includes(s.id);
      const inst = (s.installations || []).find((i) => i.destinationId === d.id);
      return el('tr', null, el('td', null, el('strong', { text: d.label }), el('div', { class: 'small muted mono', text: d.path })),
        el('td', null, inst ? el('span', { class: 'badge ok', text: t('install.installed', { v: inst.version }) }) : el('span', { class: 'badge', text: t('install.notInstalled') })),
        el('td', null, button(linked ? t('install.unlink') : t('install.link'), async () => {
          const ids = linked ? d.skillIds.filter((x) => x !== s.id) : [...d.skillIds, s.id];
          await safe(() => call('updateDestination', d.id, { skillIds: ids }), t('saved'));
          renderSkillDetail(s.id);
        }, { size: 'sm' }), ' ', button(t('sync.plan'), () => openSyncPlan(d.id, () => renderSkillDetail(s.id)), { size: 'sm', iconName: 'sync' })));
    });
    const manual = state.adapters.filter((a) => a.capabilities.export);
    const adapterSel = select(manual.map((a) => ({ value: a.id, label: a.label })), 'claude-ai');
    return el('div', { class: 'stack' },
      el('h3', { text: t('install.destinations') }),
      dests.length ? el('table', null, el('tbody', null, rows)) : el('p', { class: 'muted', text: t('install.noDest') }),
      button(t('agents.addDest'), () => openDestination(null, () => renderSkillDetail(s.id), [s.id]), { iconName: 'plus' }),
      el('h3', { text: t('install.manualExport') }),
      el('p', { class: 'small muted', text: t('install.manualHint') }),
      el('div', { class: 'row' }, adapterSel, button(t('export.choose'), async (e) => {
        const dir = await window.ush.dialog('folder', { title: t('export.choose') });
        if (!dir) return;
        await busy(e.currentTarget, async () => {
          const out = await safe(() => call('exportForAgent', adapterSel.value, s.id, dir));
          if (out) toast(t('export.done', { path: out }), 'ok');
        });
      }, { iconName: 'export' }))
    );
  }

  function openDuplicates() {
    const body = el('div', { class: 'stack' }, el('div', { class: 'row muted' }, el('span', { class: 'spinner' }), t('loading')));
    modal({ title: t('library.duplicates'), wide: true, body, footer: (close) => button(t('close'), close) });
    call('duplicates').then((pairs) => {
      if (!pairs.length) return body.replaceChildren(el('p', { class: 'muted', text: t('dup.none') }));
      body.replaceChildren(el('p', { class: 'small muted', text: t('dup.hint') }), el('table', null, el('thead', null, el('tr', null, el('th', { text: t('dup.a') }), el('th', { text: t('dup.b') }), el('th', { text: t('dup.relation') }), el('th', { text: '%' }))),
        el('tbody', null, pairs.map((p) => el('tr', null, el('td', { text: state.skillNames[p.a] || p.a }), el('td', { text: state.skillNames[p.b] || p.b }), el('td', { text: t(`rel.${p.relation}`) }), el('td', { text: Math.round(p.similarity * 100) }))))));
    }).catch((err) => body.replaceChildren(errorBox(err)));
  }

  async function openTrash() {
    const items = await call('listTrash');
    const body = items.length ? el('table', null, el('tbody', null, items.map((i) => el('tr', null, el('td', { text: i.name }), el('td', { class: 'mono small', text: i.folder }),
      el('td', null, button(t('trash.recover'), async (e) => {
        await safe(() => call('recoverFromTrash', i.file), t('trash.recovered'));
        e.currentTarget.closest('tr').remove();
        render();
        refreshCounts();
      }, { size: 'sm' })))))) : el('p', { class: 'muted', text: t('trash.empty') });
    modal({ title: t('library.trash'), body: el('div', { class: 'stack' }, el('p', { class: 'small muted', text: t('trash.hint') }), body), footer: (close) => button(t('close'), close) });
  }

  // ---------------------------------------------------------------- import

  function openImport() {
    const tabs = ['folder', 'file', 'zip', 'paste', 'git', 'url', 'pack'];
    let current = 'folder';
    const body = el('div', { class: 'stack' });
    const results = el('div', { class: 'stack' });
    const dupMode = select([{ value: 'skip', label: t('import.dupSkip') }, { value: 'import', label: t('import.dupImport') }], 'skip');
    const nameIn = el('input', { type: 'text', placeholder: 'mon-skill' });
    const textIn = el('textarea', { placeholder: '---\nname: ...\ndescription: ...\n---\n' });
    const urlIn = el('input', { type: 'url', placeholder: 'https://github.com/owner/repo' });
    let picked = null;
    const pickedLabel = el('div', { class: 'mono small muted', text: t('import.nothing') });
    const tabBar = el('div', { class: 'tabs' });
    function draw() {
      tabBar.replaceChildren(...tabs.map((x) => el('button', { class: 'tab', type: 'button', 'aria-selected': current === x ? 'true' : 'false', onclick: () => { current = x; picked = null; pickedLabel.textContent = t('import.nothing'); draw(); }, text: t(`import.${x}`) })));
      const parts = [el('p', { class: 'small muted', text: t(`import.${current}Hint`) })];
      if (['folder', 'file', 'zip', 'pack'].includes(current)) {
        parts.push(el('div', { class: 'row' }, button(t('import.browse'), async () => {
          const filters = current === 'zip' || current === 'pack' ? [{ name: 'ZIP', extensions: ['zip', 'skill'] }] : current === 'file' ? [{ name: 'Skill', extensions: ['md', 'markdown', 'txt', 'zip', 'skill'] }] : undefined;
          const p = await window.ush.dialog(current === 'folder' ? 'folder' : 'file', { title: t('import.browse'), filters });
          if (p) { picked = p; pickedLabel.textContent = p; }
        }, { iconName: 'folder' }), pickedLabel));
      }
      if (current === 'paste') parts.push(field(t('import.name'), nameIn), field(t('import.text'), textIn));
      if (current === 'git' || current === 'url') parts.push(field('URL', urlIn), el('div', { class: 'notice small', text: t('import.networkNote') }));
      if (current !== 'pack') parts.push(field(t('import.dupMode'), dupMode));
      body.replaceChildren(tabBar, ...parts, results);
    }
    draw();
    modal({
      title: t('import.title'), wide: true, body,
      footer: (close) => [button(t('close'), close), button(t('import.run'), async (e) => busy(e.currentTarget, async () => {
        const opts = { onDuplicate: dupMode.value };
        let r;
        if (['folder', 'file', 'zip', 'pack'].includes(current) && !picked) return toast(t('import.pickFirst'), 'bad');
        if (current === 'folder') r = await safe(() => call('importFolder', picked, opts));
        if (current === 'file' || current === 'zip') r = await safe(() => call('importFile', picked, opts));
        if (current === 'paste') r = await safe(() => call('importText', textIn.value, nameIn.value || 'pasted-skill', opts));
        if (current === 'git') r = await safe(() => call('importGit', urlIn.value.trim(), opts));
        if (current === 'url') r = await safe(() => call('importUrl', urlIn.value.trim(), opts));
        if (current === 'pack') {
          const p = await safe(() => call('importPack', picked));
          if (p) r = p.results;
        }
        if (!r) return;
        results.replaceChildren(el('h3', { text: t('import.results') }), ...r.map((x) => el('div', { class: 'row small' },
          el('span', { class: `badge ${x.status === 'imported' ? 'ok' : x.status === 'duplicate' ? 'warn' : ''}`, text: t(`import.status.${x.status}`) }),
          el('span', { text: x.name || x.message || x.path || '' }),
          x.security && x.security !== 'none' ? secBadge(x.security) : null,
          x.statusLabel === 'pending-review' ? el('span', { class: 'badge warn', text: t('status.pending-review') }) : null,
          (x.matches || []).length ? el('span', { class: 'muted', text: t('import.similar', { n: x.matches.length, rel: t(`rel.${x.matches[0].relation}`) }) }) : null)));
        await loadMeta();
        refreshCounts();
        if (state.view === 'library' || state.view === 'dashboard') render();
      }), { kind: 'primary', iconName: 'import' })]
    });
  }

  // ----------------------------------------------------------------- packs

  async function viewPacks() {
    const packs = await call('listPacks');
    state.packs = packs;
    const cards = packs.map((p) => el('div', { class: 'card stack', style: 'gap:6px' },
      el('div', { class: 'row' }, el('h2', { style: 'margin:0', text: p.name }), p.isDefault ? el('span', { class: 'badge accent', text: t('packs.default') }) : null, el('span', { class: `badge ${p.enabled ? 'ok' : ''} right`, text: p.enabled ? t('packs.enabled') : t('packs.disabled') })),
      el('p', { class: 'muted small', style: 'margin:0', text: p.description || t('packs.noDescription') }),
      el('div', { class: 'small', text: t('packs.skillCount', { n: p.skillIds.length }) }),
      el('div', { class: 'row small' }, p.skillIds.slice(0, 6).map((id) => el('span', { class: 'chip', text: state.skillNames[id] || id }))),
      el('div', { class: 'row' }, button(t('open'), () => openPackEditor(p.id), { size: 'sm', kind: 'primary' }), button(t('packs.duplicate'), async () => { await safe(() => call('duplicatePack', p.id), t('saved')); render(); }, { size: 'sm', iconName: 'copy' }),
        button(t('action.export'), async () => {
          const file = await window.ush.dialog('save', { title: t('action.export'), defaultPath: `pack-${p.name}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
          if (file) await safe(() => call('exportPack', p.id, file), t('export.done', { path: file }));
        }, { size: 'sm', iconName: 'export' }))
    ));
    return el('div', { class: 'stack' },
      pageHead(t('nav.packs'), t('packs.subtitle'), [
        button(t('packs.select'), () => openSelector(), { iconName: 'eye' }),
        button(t('packs.smart'), () => openSmartPack(), { iconName: 'sparkle' }),
        button(t('packs.new'), () => openPackEditor(null), { iconName: 'plus', kind: 'primary' })
      ]),
      packs.length ? el('div', { class: 'grid cards' }, cards) : el('div', { class: 'empty' }, el('h3', { text: t('packs.emptyTitle') }), el('p', { text: t('packs.emptyText') }))
    );
  }

  async function openPackEditor(id) {
    const all = await call('search', { sort: 'name' });
    const p = id ? state.packs.find((x) => x.id === id) : { name: '', description: '', skillIds: [], enabled: true, isDefault: false, agentIds: [], projectPaths: [], rules: {} };
    const ids = [...p.skillIds];
    const name = el('input', { type: 'text', value: p.name });
    const desc = el('input', { type: 'text', value: p.description });
    const enabled = el('input', { type: 'checkbox', checked: p.enabled });
    const isDefault = el('input', { type: 'checkbox', checked: p.isDefault });
    const requireReviewed = el('input', { type: 'checkbox', checked: p.rules?.requireReviewed });
    const maxSkills = el('input', { type: 'number', min: '0', value: p.rules?.maxSkills || '', style: 'width:90px' });
    const ruleNotes = el('input', { type: 'text', value: p.rules?.notes || '', placeholder: t('packs.ruleNotes') });
    const agents = new Set(p.agentIds || []);
    const projects = [...(p.projectPaths || [])];
    const listBox = el('div', { class: 'stack', style: 'gap:4px' });
    const projBox = el('div', { class: 'stack small' });
    const filterIn = el('input', { type: 'search', placeholder: t('packs.findSkill') });
    const pickBox = el('div', { class: 'stack', style: 'max-height:220px;overflow:auto;gap:2px' });
    function drawList() {
      listBox.replaceChildren(...(ids.length ? ids.map((sid, i) => el('div', { class: 'row chip', style: 'justify-content:space-between;padding:4px 8px' }, el('span', { text: `${i + 1}. ${state.skillNames[sid] || sid}` }),
        el('span', { class: 'row' }, button('', () => { if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; drawList(); } }, { size: 'sm', kind: 'ghost', iconName: 'up', title: t('up') }),
          button('', () => { if (i < ids.length - 1) { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; drawList(); } }, { size: 'sm', kind: 'ghost', iconName: 'down', title: t('down') }),
          button('', () => { ids.splice(i, 1); drawList(); drawPick(); }, { size: 'sm', kind: 'ghost', iconName: 'close', title: t('remove') })))) : [el('p', { class: 'muted small', text: t('packs.noSkills') })]));
    }
    function drawPick() {
      const q = filterIn.value.toLowerCase();
      pickBox.replaceChildren(...all.filter((s) => !ids.includes(s.id) && (!q || s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))).slice(0, 60).map((s) => el('div', { class: 'row small' }, button(t('add'), () => { ids.push(s.id); drawList(); drawPick(); }, { size: 'sm' }), el('span', { text: s.name }), el('span', { class: 'muted', text: (s.description || '').slice(0, 70) }))));
    }
    function drawProjects() {
      projBox.replaceChildren(...projects.map((pp, i) => el('div', { class: 'row' }, el('span', { class: 'mono', text: pp }), button('', () => { projects.splice(i, 1); drawProjects(); }, { size: 'sm', kind: 'ghost', iconName: 'close' }))),
        button(t('packs.addProject'), async () => { const d = await window.ush.dialog('folder', {}); if (d) { projects.push(d); drawProjects(); } }, { size: 'sm', iconName: 'folder' }));
    }
    filterIn.addEventListener('input', drawPick);
    drawList(); drawPick(); drawProjects();
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row' }, field(t('packs.name'), name), el('div', { class: 'grow' }, field(t('packs.description'), desc))),
      el('div', { class: 'row' }, el('label', { class: 'check' }, enabled, t('packs.enabled')), el('label', { class: 'check' }, isDefault, t('packs.default'))),
      el('div', { class: 'grid two' },
        el('div', { class: 'stack' }, el('h3', { text: t('packs.content') }), listBox),
        el('div', { class: 'stack' }, el('h3', { text: t('packs.addSkills') }), filterIn, pickBox)),
      el('h3', { text: t('packs.agents') }),
      el('div', { class: 'row' }, state.adapters.map((a) => el('label', { class: 'check chip' }, el('input', { type: 'checkbox', checked: agents.has(a.id), onchange: (e) => (e.target.checked ? agents.add(a.id) : agents.delete(a.id)) }), a.label))),
      el('h3', { text: t('packs.projects') }), projBox,
      el('h3', { text: t('packs.rules') }),
      el('div', { class: 'row' }, el('label', { class: 'check' }, requireReviewed, t('packs.requireReviewed')), field(t('packs.maxSkills'), maxSkills), el('div', { class: 'grow' }, field(t('packs.ruleNotesLabel'), ruleNotes)))
    );
    modal({
      title: id ? t('packs.edit') : t('packs.new'), wide: true, body,
      footer: (close) => [
        id ? button(t('delete'), async () => {
          if (!(await confirmDialog(t('packs.deleteConfirm', { name: p.name }), t('packs.deleteDetail'), { danger: true }))) return;
          await safe(() => call('deletePack', id), t('saved'));
          close(); await loadMeta(); render(); refreshCounts();
        }, { kind: 'danger', iconName: 'trash' }) : null,
        id ? button(t('packs.syncTo'), () => { close(); openDestination(null, () => go('agents'), [], [id]); }, { iconName: 'sync' }) : null,
        button(t('cancel'), close),
        button(t('save'), async (e) => busy(e.currentTarget, async () => {
          const max = Number(maxSkills.value) || null;
          if (max && ids.length > max) return toast(t('packs.tooMany', { n: max }), 'bad');
          const payload = { name: name.value.trim() || t('packs.untitled'), description: desc.value, skillIds: ids, enabled: enabled.checked, isDefault: isDefault.checked, agentIds: [...agents], projectPaths: projects, rules: { requireReviewed: requireReviewed.checked, maxSkills: max, notes: ruleNotes.value } };
          const r = await safe(() => (id ? call('updatePack', id, payload) : call('createPack', payload)), t('saved'));
          if (r) { close(); await loadMeta(); render(); refreshCounts(); }
        }), { kind: 'primary', iconName: 'check' })
      ]
    });
  }

  function openSmartPack() {
    const req = el('input', { type: 'text', placeholder: t('smart.placeholder'), style: 'width:100%' });
    const out = el('div', { class: 'stack' });
    let proposal = null;
    const chosen = new Set();
    const examples = el('div', { class: 'row small' }, ['smart.ex1', 'smart.ex2', 'smart.ex3', 'smart.ex4', 'smart.ex5', 'smart.ex6'].map((k) => el('button', { class: 'chip', type: 'button', onclick: () => { req.value = t(k); }, text: t(k) })));
    async function run(btn) {
      await busy(btn, async () => {
        proposal = await safe(() => call('proposePack', req.value));
        if (!proposal) return;
        chosen.clear();
        proposal.skills.forEach((s) => chosen.add(s.skillId));
        out.replaceChildren(
          el('h3', { text: proposal.name }),
          proposal.skills.length ? el('div', { class: 'stack', style: 'gap:4px' }, proposal.skills.map((s) => el('label', { class: 'check', style: 'align-items:flex-start' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => (e.target.checked ? chosen.add(s.skillId) : chosen.delete(s.skillId)) }),
            el('span', null, el('strong', { text: s.name }), s.status !== 'active' ? el('span', { class: 'badge warn', style: 'margin-left:6px', text: t(`status.${s.status}`) }) : null, el('div', { class: 'small muted', text: s.reasons.join(' | ') }))))) : el('p', { class: 'muted', text: t('smart.noneFound') }),
          el('h3', { text: t('smart.coverage') }),
          el('table', null, el('tbody', null, proposal.coverage.map((c) => el('tr', null, el('td', { text: c.need }), el('td', null, el('span', { class: `badge ${c.covered ? 'ok' : 'bad'}`, text: c.covered ? t('smart.covered') : t('smart.missing') })))))),
          proposal.missing.length ? el('div', { class: 'notice warn', text: t('smart.missingNote', { list: proposal.missing.join(', ') }) }) : null,
          proposal.conflicts.length ? el('div', { class: 'notice' }, proposal.conflicts.map((c) => el('div', { class: 'small', text: `${c.name} : ${c.message}` }))) : null
        );
      });
    }
    modal({
      title: t('packs.smart'), wide: true,
      body: el('div', { class: 'stack' }, el('p', { class: 'small muted', text: t('smart.hint') }), req, examples, out),
      footer: (close) => [button(t('cancel'), close), button(t('smart.analyze'), (e) => run(e.currentTarget), { iconName: 'sparkle' }), button(t('smart.create'), async () => {
        if (!proposal) return toast(t('smart.analyzeFirst'), 'bad');
        const r = await safe(() => call('createPack', { name: proposal.name, description: proposal.request, skillIds: proposal.skills.map((s) => s.skillId).filter((x) => chosen.has(x)) }), t('saved'));
        if (r) { close(); await loadMeta(); go('packs'); refreshCounts(); }
      }, { kind: 'primary', iconName: 'check' })]
    });
  }

  function openSelector() {
    const task = el('textarea', { placeholder: t('select.placeholder'), style: 'font-family:var(--font);min-height:70px' });
    const agent = select([{ value: '', label: t('select.anyAgent') }, ...state.adapters.map((a) => ({ value: a.id, label: a.label }))], '');
    const pack = select([{ value: '', label: t('select.anyPack') }, ...state.packs.map((p) => ({ value: p.id, label: p.name }))], '');
    const out = el('div', { class: 'stack' });
    let last = null;
    modal({
      title: t('packs.select'), wide: true,
      body: el('div', { class: 'stack' }, el('p', { class: 'small muted', text: t('select.hint') }), task, el('div', { class: 'row' }, agent, pack), out),
      footer: (close) => [button(t('close'), close), button(t('select.run'), async (e) => busy(e.currentTarget, async () => {
        last = await safe(() => call('selectForTask', task.value, { agentId: agent.value || null, packId: pack.value || null }));
        if (!last) return;
        out.replaceChildren(
          el('h3', { text: t('select.result', { n: last.selected.length, total: last.consideredCount }) }),
          last.selected.length ? el('table', null, el('tbody', null, last.selected.map((s) => el('tr', null, el('td', null, el('strong', { text: s.name })), el('td', { class: 'small', text: s.reason }), el('td', { class: 'small muted', text: s.score }), el('td', { class: 'small', text: s.warning || '' }))))) : el('p', { class: 'muted', text: t('select.none') }),
          last.conflicts.length ? el('div', { class: 'notice' }, last.conflicts.map((c) => el('div', { class: 'small', text: `${c.name} : ${c.message}` }))) : null);
      }), { iconName: 'eye' }), button(t('select.toPack'), async () => {
        if (!last?.selected.length) return toast(t('select.runFirst'), 'bad');
        const r = await safe(() => call('createPack', { name: `${t('select.packPrefix')} ${task.value.slice(0, 40)}`, description: task.value, skillIds: last.selected.map((s) => s.skillId) }), t('saved'));
        if (r) { close(); await loadMeta(); go('packs'); }
      }, { kind: 'primary' })]
    });
  }

  // ---------------------------------------------------------------- agents

  async function viewAgents() {
    const [agents, conflicts, dests] = await Promise.all([call('agents'), call('openConflicts'), call('listDestinations')]);
    const conflictCard = conflicts.length ? el('div', { class: 'card stack' }, el('h2', { text: t('conflicts.title', { n: conflicts.length }) }),
      conflicts.map((c) => el('div', { class: 'row', style: 'border-bottom:1px solid var(--line);padding-bottom:8px' },
        el('div', { class: 'grow' }, el('strong', { text: c.skillName }), el('div', { class: 'small muted', text: c.reason }), el('div', { class: 'small mono muted', text: c.path })),
        c.destinationId ? [
          button(t('conflicts.diff'), () => openDiff(c.destinationId, c.skillId), { size: 'sm', iconName: 'eye' }),
          button(t('conflicts.keepLibrary'), () => resolve(c, 'keep-library'), { size: 'sm' }),
          button(t('conflicts.keepDestination'), () => resolve(c, 'keep-destination'), { size: 'sm' })
        ] : [
          button(t('conflicts.keepSource'), () => resolve(c, 'keep-source'), { size: 'sm' }),
          button(t('conflicts.keepLibrary'), () => resolve(c, 'keep-library'), { size: 'sm' }),
          button(t('conflicts.importCopy'), () => resolve(c, 'import-as-copy'), { size: 'sm' })
        ]))) : null;
    async function resolve(c, choice) {
      const risky = choice === 'keep-library' || choice === 'keep-source' || choice === 'keep-destination';
      if (risky && !(await confirmDialog(t('conflicts.confirm'), t('conflicts.confirmDetail')))) return;
      await safe(() => call('resolveConflict', c.id, choice), t('conflicts.resolved'));
      render();
      refreshCounts();
    }
    const cards = agents.map((a) => el('div', { class: 'card stack', style: 'gap:8px' },
      el('div', { class: 'row' }, el('h2', { style: 'margin:0', text: a.label }), compatBadge(a.compatibility), el('span', { class: `badge ${a.detected ? 'ok' : ''} right`, text: a.detected ? t('agents.detected') : t('agents.notDetected') })),
      el('div', { class: 'small muted', text: `${a.vendor} - ${a.notes}` }),
      el('div', { class: 'small' }, el('strong', { text: t('agents.formats') }), ' ', (a.formats || []).join(', ')),
      a.locations.length ? el('div', { class: 'stack small', style: 'gap:2px' }, el('strong', { text: t('agents.paths') }), a.locations.map((l) => el('div', { class: 'row' }, el('span', { class: `badge ${l.state === 'ok' ? 'ok' : l.state === 'broken-link' ? 'bad' : ''}`, text: t(`path.${l.state}`) }), el('span', { class: 'mono', text: l.path })))) : null,
      el('div', { class: 'small' }, el('strong', { text: t('agents.capabilities') }), ' ', Object.entries(a.capabilities).filter(([, v]) => v).map(([k]) => t(`cap.${k}`)).join(', ')),
      a.limits.length ? el('details', { class: 'small' }, el('summary', { text: t('agents.limits') }), el('ul', null, a.limits.map((l) => el('li', { text: l })))) : null,
      el('div', { class: 'small' }, t('agents.installedCount', { n: a.installedCount })),
      a.destinations.length ? el('div', { class: 'stack', style: 'gap:6px' }, a.destinations.map((d) => el('div', { class: 'row chip', style: 'padding:6px 8px' },
        el('div', { class: 'grow', style: 'min-width:0' }, el('strong', { text: d.label }), el('div', { class: 'mono small muted', text: d.path }), el('div', { class: 'small muted', text: `${t(`mode.${d.mode}`)} - ${t('agents.selection', { s: d.skillIds.length, p: d.packIds.length })}${d.lastSyncAt ? ` - ${fmtDate(d.lastSyncAt)}` : ''}` })),
        button(t('sync.plan'), () => openSyncPlan(d.id, render), { size: 'sm', iconName: 'sync', kind: 'primary' }),
        button(t('edit'), () => openDestination(d, render), { size: 'sm' })))) : null,
      a.capabilities.install ? button(t('agents.addDest'), () => openDestination({ adapterId: a.id, path: a.locations[0]?.path || '' }, render), { size: 'sm', iconName: 'plus' }) : el('div', { class: 'notice small', text: a.layout === 'manual' ? t('agents.manualOnly') : t('agents.readOnly') })
    ));
    return el('div', { class: 'stack' },
      pageHead(t('nav.agents'), t('agents.subtitle', { n: dests.length }), [button(t('agents.addDest'), () => openDestination(null, render), { iconName: 'plus', kind: 'primary' })]),
      conflictCard,
      el('div', { class: 'grid cards' }, cards),
      el('div', { class: 'notice small', text: t('agents.customHint') })
    );
  }

  async function openDestination(d, after, presetSkills = [], presetPacks = []) {
    const isNew = !d?.id;
    const cur = d || {};
    const installable = state.adapters.filter((a) => a.capabilities.install);
    const adapter = select(installable.map((a) => ({ value: a.id, label: `${a.label} (${t(`compat.${a.compatibility}`)})` })), cur.adapterId || 'claude-code');
    const label = el('input', { type: 'text', value: cur.label || '' });
    const pathIn = el('input', { type: 'text', value: cur.path || '', style: 'width:100%' });
    const mode = select(['manual', 'startup', 'on-change', 'interval'].map((m) => ({ value: m, label: t(`mode.${m}`) })), cur.mode || 'manual');
    const interval = el('input', { type: 'number', min: '1', value: cur.intervalMinutes || 60, style: 'width:90px' });
    const enabled = el('input', { type: 'checkbox', checked: cur.enabled !== false });
    const packs = new Set([...(cur.packIds || []), ...presetPacks]);
    const skills = new Set([...(cur.skillIds || []), ...presetSkills]);
    const all = await call('search', { sort: 'name' });
    const suggest = el('div', { class: 'row small' });
    async function fillSuggest() {
      const a = state.adapters.find((x) => x.id === adapter.value);
      suggest.replaceChildren(...(a?.userPaths || []).map((p) => el('button', { class: 'chip', type: 'button', onclick: () => { pathIn.value = p; }, text: p })));
    }
    adapter.addEventListener('change', fillSuggest);
    fillSuggest();
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row' }, field(t('dest.adapter'), adapter), el('div', { class: 'grow' }, field(t('dest.label'), label))),
      field(t('dest.path'), el('div', { class: 'row' }, pathIn, button(t('import.browse'), async () => { const p = await window.ush.dialog('folder', {}); if (p) pathIn.value = p; }, { iconName: 'folder' }))),
      suggest,
      el('div', { class: 'row' }, field(t('dest.mode'), mode), field(t('dest.interval'), interval), el('label', { class: 'check' }, enabled, t('dest.enabled'))),
      el('div', { class: 'notice small', text: t('dest.safety') }),
      el('h3', { text: t('dest.packs') }),
      state.packs.length ? el('div', { class: 'row' }, state.packs.map((p) => el('label', { class: 'check chip' }, el('input', { type: 'checkbox', checked: packs.has(p.id), onchange: (e) => (e.target.checked ? packs.add(p.id) : packs.delete(p.id)) }), p.name))) : el('p', { class: 'muted small', text: t('packs.emptyTitle') }),
      el('h3', { text: t('dest.skills') }),
      el('div', { class: 'stack', style: 'max-height:200px;overflow:auto;gap:2px' }, all.map((s) => el('label', { class: 'check small' }, el('input', { type: 'checkbox', checked: skills.has(s.id), onchange: (e) => (e.target.checked ? skills.add(s.id) : skills.delete(s.id)) }), s.name, s.status === 'pending-review' ? el('span', { class: 'badge warn', text: t('status.pending-review') }) : null)))
    );
    modal({
      title: isNew ? t('agents.addDest') : t('dest.edit'), wide: true, body,
      footer: (close) => [
        !isNew ? button(t('remove'), async () => {
          if (!(await confirmDialog(t('dest.removeConfirm'), t('dest.removeDetail'), { danger: true }))) return;
          await safe(() => call('removeDestination', cur.id), t('saved'));
          close(); after && after();
        }, { kind: 'danger' }) : null,
        button(t('cancel'), close),
        button(t('save'), async (e) => busy(e.currentTarget, async () => {
          if (!pathIn.value.trim()) return toast(t('dest.pathRequired'), 'bad');
          const payload = { adapterId: adapter.value, label: label.value || state.adapters.find((a) => a.id === adapter.value)?.label, path: pathIn.value.trim(), mode: mode.value, intervalMinutes: Number(interval.value) || 60, enabled: enabled.checked, packIds: [...packs], skillIds: [...skills] };
          const r = await safe(() => (isNew ? call('addDestination', payload) : call('updateDestination', cur.id, payload)), t('saved'));
          if (r) { close(); after && after(); if (isNew) openSyncPlan(r.id, after); }
        }), { kind: 'primary', iconName: 'check' })
      ]
    });
  }

  async function openSyncPlan(destId, after) {
    const body = el('div', { class: 'stack' }, el('div', { class: 'row muted' }, el('span', { class: 'spinner' }), t('loading')));
    const choices = {};
    const m = modal({
      title: t('sync.title'), wide: true, body,
      footer: (close) => [button(t('close'), close), button(t('sync.apply'), async (e) => busy(e.currentTarget, async () => {
        const r = await safe(() => call('runSync', destId, choices));
        if (!r) return;
        toast(t('sync.done', { a: r.applied.length, c: r.conflicts.length, e: r.errors.length }), r.errors.length ? 'bad' : 'ok');
        window.ush.notify('Universal Skills Hub', t('sync.done', { a: r.applied.length, c: r.conflicts.length, e: r.errors.length }));
        close(); refreshCounts(); after && after();
      }), { kind: 'primary', iconName: 'sync' })]
    });
    let plan;
    try {
      plan = await call('planSync', destId);
    } catch (err) {
      body.replaceChildren(errorBox(err));
      return m;
    }
    const opts = {
      conflict: [['skip', t('sync.skip')], ['keep-library', t('conflicts.keepLibrary')], ['keep-destination', t('conflicts.keepDestination')]],
      missing: [['skip', t('sync.skip')], ['reinstall', t('sync.reinstall')], ['forget', t('sync.forget')]],
      remove: [['skip', t('sync.keep')], ['remove', t('sync.removeIt')]],
      install: [['apply', t('sync.do')], ['skip', t('sync.skip')]],
      update: [['apply', t('sync.do')], ['skip', t('sync.skip')]]
    };
    const cls = { install: 'accent', update: 'accent', 'up-to-date': 'ok', conflict: 'bad', missing: 'warn', remove: 'warn', blocked: 'warn' };
    body.replaceChildren(
      el('p', { class: 'small muted', text: t('sync.hint') }),
      plan.items.length ? el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Skill' }), el('th', { text: t('sync.action') }), el('th', { text: t('sync.detail') }), el('th', { text: t('sync.choice') }))),
        el('tbody', null, plan.items.map((i) => el('tr', null,
          el('td', null, el('strong', { text: i.name }), el('div', { class: 'mono small muted', text: i.target })),
          el('td', null, el('span', { class: `badge ${cls[i.action] || ''}`, text: t(`sync.a.${i.action}`) })),
          el('td', { class: 'small', text: i.reason || (i.toVersion ? `v${i.fromVersion} > v${i.toVersion}` : '') }),
          el('td', null, opts[i.action] ? el('div', { class: 'row' }, select(opts[i.action].map(([v, l]) => ({ value: v, label: l })), opts[i.action][0][0], (v) => { choices[i.skillId] = v; }),
            i.action === 'conflict' ? button(t('conflicts.diff'), () => openDiff(destId, i.skillId), { size: 'sm', iconName: 'eye' }) : null) : null))))) : el('p', { class: 'muted', text: t('sync.nothing') })
    );
    return m;
  }

  async function openDiff(destId, skillId) {
    const body = el('div', { class: 'stack' });
    modal({ title: t('conflicts.diff'), wide: true, body, footer: (close) => button(t('close'), close) });
    const r = await safe(() => call('diffWithDestination', destId, skillId));
    if (!r) return;
    body.replaceChildren(el('p', { class: 'small muted', text: t('diff.legend') }), ...(r.files.length ? r.files.map((f) => el('div', { class: 'stack' }, el('h3', { text: `${f.path}${f.onlyIn ? ` (${t(`diff.only.${f.onlyIn}`)})` : ''}` }), renderDiff(f.diff))) : [el('p', { class: 'muted', text: t('version.same') })]));
  }

  // --------------------------------------------------------------- sources

  async function viewSources() {
    const [sources, suggestions] = await Promise.all([call('listSources'), call('suggestSources')]);
    const rows = sources.map((s) => el('div', { class: 'card stack', style: 'gap:6px' },
      el('div', { class: 'row' }, el('h2', { style: 'margin:0', text: s.label }), s.paused ? el('span', { class: 'badge warn', text: t('sources.paused') }) : el('span', { class: 'badge ok', text: t(`smode.${s.mode}`) }), s.readOnly ? el('span', { class: 'badge', text: t('sources.readOnly') }) : null),
      el('div', { class: 'mono small muted', text: s.path }),
      s.lastError ? el('div', { class: 'notice bad small', text: s.lastError }) : null,
      el('div', { class: 'small' }, s.lastScanAt ? t('sources.lastScan', { d: fmtDate(s.lastScanAt) }) : t('sources.neverScanned'), s.lastStats ? ` - ${t('sources.stats', s.lastStats)}` : ''),
      el('div', { class: 'small muted', text: `${s.autoImport ? t('sources.autoImport') : t('sources.manualImport')} - ${s.autoUpdate ? t('sources.autoUpdate') : t('sources.manualUpdate')}` }),
      el('div', { class: 'row' },
        button(t('sources.scan'), async (e) => busy(e.currentTarget, async () => { const r = await safe(() => call('scan', s.id)); if (r) openScanResult(s, r); }), { kind: 'primary', size: 'sm', iconName: 'scan' }),
        button(s.paused ? t('sources.resume') : t('sources.pause'), async () => { await safe(() => call('updateSource', s.id, { paused: !s.paused }), t('saved')); render(); }, { size: 'sm' }),
        button(t('edit'), () => openSource(s), { size: 'sm' }),
        button(t('remove'), async () => {
          if (!(await confirmDialog(t('sources.removeConfirm', { name: s.label }), t('sources.removeDetail'), { danger: true }))) return;
          await safe(() => call('removeSource', s.id), t('saved')); render();
        }, { size: 'sm', kind: 'danger' }))
    ));
    const sugg = suggestions.filter((x) => !x.known && x.state !== 'missing');
    return el('div', { class: 'stack' },
      pageHead(t('nav.sources'), t('sources.subtitle'), [button(t('sources.add'), () => openSource(null), { iconName: 'plus', kind: 'primary' })]),
      sugg.length || suggestions.some((x) => x.state === 'broken-link') ? el('div', { class: 'card stack' }, el('h2', { text: t('sources.suggestions') }),
        suggestions.filter((x) => !x.known && x.state !== 'missing').map((x) => el('div', { class: 'row small' },
          el('span', { class: `badge ${x.state === 'ok' ? 'ok' : 'bad'}`, text: t(`path.${x.state}`) }), el('strong', { text: x.label }), el('span', { class: 'mono muted', text: x.path }),
          x.state === 'ok' ? button(t('add'), async () => { await safe(() => call('addSource', { path: x.path, label: x.label, adapterId: x.adapterId, readOnly: true }), t('saved')); render(); }, { size: 'sm', kind: 'primary' }) : el('span', { class: 'muted', text: t('sources.brokenHint') })))) : null,
      sources.length ? el('div', { class: 'grid cards' }, rows) : el('div', { class: 'empty' }, el('h3', { text: t('sources.emptyTitle') }), el('p', { text: t('sources.emptyText') }))
    );
  }

  function openSource(s) {
    const cur = s || { mode: 'manual', intervalMinutes: 30, maxDepth: 6, readOnly: true };
    const pathIn = el('input', { type: 'text', value: cur.path || '', style: 'width:100%' });
    const label = el('input', { type: 'text', value: cur.label || '' });
    const adapter = select([{ value: '', label: t('sources.noAgent') }, ...state.adapters.map((a) => ({ value: a.id, label: a.label }))], cur.adapterId || '');
    const mode = select(['manual', 'startup', 'watch', 'interval'].map((m) => ({ value: m, label: t(`smode.${m}`) })), cur.mode);
    const interval = el('input', { type: 'number', min: '1', value: cur.intervalMinutes, style: 'width:90px' });
    const depth = el('input', { type: 'number', min: '0', max: '12', value: cur.maxDepth, style: 'width:90px' });
    const autoImport = el('input', { type: 'checkbox', checked: cur.autoImport });
    const autoUpdate = el('input', { type: 'checkbox', checked: cur.autoUpdate });
    modal({
      title: s ? t('sources.edit') : t('sources.add'),
      body: el('div', { class: 'stack' },
        field(t('dest.path'), el('div', { class: 'row' }, pathIn, button(t('import.browse'), async () => { const p = await window.ush.dialog('folder', {}); if (p) pathIn.value = p; }, { iconName: 'folder' }))),
        el('div', { class: 'row' }, el('div', { class: 'grow' }, field(t('dest.label'), label)), field(t('sources.agent'), adapter)),
        el('div', { class: 'row' }, field(t('sources.mode'), mode), field(t('dest.interval'), interval), field(t('sources.depth'), depth)),
        el('label', { class: 'check' }, autoImport, t('sources.autoImportLabel')),
        el('label', { class: 'check' }, autoUpdate, t('sources.autoUpdateLabel')),
        el('div', { class: 'notice small', text: t('sources.safety') })),
      footer: (close) => [button(t('cancel'), close), button(t('save'), async (e) => busy(e.currentTarget, async () => {
        if (!pathIn.value.trim()) return toast(t('dest.pathRequired'), 'bad');
        const payload = { path: pathIn.value.trim(), label: label.value, adapterId: adapter.value || null, mode: mode.value, intervalMinutes: Number(interval.value), maxDepth: Number(depth.value), autoImport: autoImport.checked, autoUpdate: autoUpdate.checked };
        const r = await safe(() => (s ? call('updateSource', s.id, payload) : call('addSource', payload)), t('saved'));
        if (r) { close(); render(); }
      }), { kind: 'primary', iconName: 'check' })]
    });
  }

  function openScanResult(src, r) {
    const selected = new Set(r.report.items.filter((i) => i.state === 'new').map((i) => i.dir));
    const cls = { new: 'accent', modified: 'warn', unchanged: 'ok', moved: 'info', renamed: 'info', duplicate: '', incomplete: 'warn' };
    const body = el('div', { class: 'stack' },
      el('p', { class: 'small', text: t('sources.stats', r.summary) }),
      r.report.errors.length ? el('div', { class: 'notice bad' }, r.report.errors.map((e) => el('div', { text: e }))) : null,
      r.report.items.length ? el('table', null, el('tbody', null, r.report.items.map((i) => el('tr', null,
        el('td', null, ['new', 'incomplete', 'modified'].includes(i.state) ? el('input', { type: 'checkbox', checked: selected.has(i.dir), 'aria-label': i.name, onchange: (e) => (e.target.checked ? selected.add(i.dir) : selected.delete(i.dir)) }) : null),
        el('td', null, el('span', { class: `badge ${cls[i.state] || ''}`, text: t(`scan.${i.state}`) })),
        el('td', null, el('strong', { text: i.name }), el('div', { class: 'mono small muted', text: i.dir }), i.localEdit ? el('div', { class: 'small', text: t('scan.localEdit') }) : null))))) : el('p', { class: 'muted', text: t('scan.nothing') }),
      r.report.missing.length ? el('div', { class: 'notice warn' }, el('strong', { text: t('scan.missingTitle') }), r.report.missing.map((m) => el('div', { class: 'small', text: `${m.name} - ${m.path}` }))) : null
    );
    modal({
      title: t('scan.title', { name: src.label }), wide: true, body,
      footer: (close) => [button(t('close'), close), button(t('scan.apply'), async (e) => busy(e.currentTarget, async () => {
        if (!selected.size) return toast(t('scan.selectFirst'), 'bad');
        const a = await safe(() => call('applyScanSelection', src.id, { paths: [...selected], importNew: true, updateModified: true }));
        if (!a) return;
        toast(t('scan.applied', { i: a.imported.length, u: a.updated.length, c: a.conflicts.length }), a.conflicts.length ? 'bad' : 'ok');
        close(); await loadMeta(); render(); refreshCounts();
      }), { kind: 'primary', iconName: 'import' })]
    });
  }

  // --------------------------------------------------------------- history

  async function viewHistory() {
    const typeSel = select([{ value: '', label: t('history.all') }, ...['skill', 'source', 'sync', 'pack', 'backup', 'export', 'conflict', 'security', 'destination', 'settings', 'app'].map((x) => ({ value: x, label: t(`htype.${x}`) }))], state.historyType || '', (v) => { state.historyType = v; render(); });
    const entries = await call('history', { limit: 500, type: state.historyType || null });
    return el('div', { class: 'stack' },
      pageHead(t('nav.history'), t('history.subtitle'), [typeSel]),
      entries.length ? el('div', { class: 'panel' }, el('table', null, el('thead', null, el('tr', null, el('th', { text: t('date') }), el('th', { text: t('history.type') }), el('th', { text: t('history.message') }))),
        el('tbody', null, entries.map((h) => {
          const { ts, type, message, ...rest } = h;
          return el('tr', null, el('td', { class: 'small', style: 'white-space:nowrap', text: fmtDate(ts) }), el('td', null, el('span', { class: 'badge', text: type })),
            el('td', null, message, Object.keys(rest).length ? el('details', { class: 'small' }, el('summary', { class: 'muted', text: t('history.details') }), el('pre', { class: 'code', text: JSON.stringify(rest, null, 2) })) : null));
        })))) : el('div', { class: 'empty', text: t('history.empty') })
    );
  }

  // -------------------------------------------------------------- security

  async function viewSecurity() {
    const s = await call('securityOverview');
    const section = (key, items) => el('div', { class: 'card stack', style: 'gap:6px' }, el('h2', { text: `${t(`secview.${key}`)} (${items.length})` }),
      items.length ? items.map((i) => el('div', { class: 'row small' }, secBadge(i.level), el('a', { href: '#library', onclick: (e) => { e.preventDefault(); state.selectedSkill = i.id; state.skillTab = 'security'; go('library'); }, text: i.name }), el('span', { class: 'muted', text: i.findings.slice(0, 2).map((f) => f.label).join(' | ') }))) : el('p', { class: 'muted small', text: t('secview.none') }));
    return el('div', { class: 'stack' },
      pageHead(t('nav.security'), t('secview.subtitle')),
      el('div', { class: 'notice', text: t('secview.policy') }),
      el('div', { class: 'grid cards' },
        section('pending', s.pending), section('high', s.high), section('withScripts', s.withScripts), section('withExecutables', s.withExecutables),
        section('withPermissions', s.withPermissions), section('unknownSources', s.unknownSources), section('modifiedAfterReview', s.modifiedAfterReview)),
      el('div', { class: 'card' }, el('h2', { text: t('secview.rules') }), el('table', null, el('tbody', null, s.rules.map((r) => el('tr', null, el('td', null, secBadge(r.level)), el('td', { text: r.label }), el('td', { class: 'mono small muted', text: r.id }))))))
    );
  }

  // -------------------------------------------------------------- settings

  async function viewSettings() {
    const [settings, info, backups, cats] = await Promise.all([call('getSettings'), call('dataInfo'), call('listBackups'), call('listCategories')]);
    const save = async (patch) => {
      const r = await safe(() => call('updateSettings', patch), t('saved'));
      if (r) state.settings = r;
      return r;
    };
    const lang = select([{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }], settings.language, async (v) => { await save({ language: v }); window.setLang(v); renderTopbar(); render(); });
    const theme = select([{ value: 'system', label: t('settings.themeSystem') }, { value: 'light', label: t('settings.themeLight') }, { value: 'dark', label: t('settings.themeDark') }], settings.theme, async (v) => { await save({ theme: v }); applyTheme(v); });
    const toggle = (key) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: settings[key], onchange: (e) => save({ [key]: e.target.checked }) }), t(`settings.${key}`));
    const depth = el('input', { type: 'number', min: '0', max: '12', value: settings.maxScanDepth, style: 'width:90px', onchange: (e) => save({ maxScanDepth: Number(e.target.value) }) });
    const catName = el('input', { type: 'text', placeholder: t('cat.name') });
    const catKw = el('input', { type: 'text', placeholder: t('cat.keywords') });
    return el('div', { class: 'stack' },
      pageHead(t('nav.settings'), t('settings.subtitle')),
      el('div', { class: 'grid two' },
        el('div', { class: 'card stack' }, el('h2', { text: t('settings.display') }),
          el('div', { class: 'row' }, field(t('settings.language'), lang), field(t('settings.theme'), theme)),
          el('h2', { text: t('settings.behaviour') }),
          toggle('notifications'), toggle('autoClassify'), toggle('scanOnStartup'), toggle('backupBeforeRestore'),
          field(t('settings.maxScanDepth'), depth)),
        el('div', { class: 'card stack' }, el('h2', { text: t('settings.privacy') }),
          el('p', { class: 'small', text: t('settings.privacyText') }),
          el('dl', { class: 'kv' }, el('dt', { text: t('settings.dataDir') }), el('dd', { class: 'mono', text: info.dataDir }), el('dt', { text: t('settings.version') }), el('dd', { text: info.version || '-' }), el('dt', { text: t('settings.customAdapters') }), el('dd', { text: `${(info.customAdapters?.loaded || []).join(', ') || '-'}${(info.customAdapters?.errors || []).length ? ` (${info.customAdapters.errors.length} ${t('settings.errors')})` : ''}` })),
          el('div', { class: 'row' }, button(t('settings.openData'), () => window.ush.reveal(`${info.dataDir}/library.json`), { iconName: 'folder' })))
      ),
      el('div', { class: 'card stack' }, el('h2', { text: t('settings.backups') }),
        el('p', { class: 'small muted', text: t('settings.backupText') }),
        el('div', { class: 'row' },
          button(t('backup.create'), async (e) => busy(e.currentTarget, async () => { const r = await safe(() => call('createBackup', null, {})); if (r) { toast(t('backup.created', { file: r.file }), 'ok'); render(); } }), { kind: 'primary', iconName: 'backup' }),
          button(t('backup.createAs'), async () => {
            const f = await window.ush.dialog('save', { defaultPath: 'universal-skills-hub-backup.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
            if (f) { const r = await safe(() => call('createBackup', f, {})); if (r) toast(t('backup.created', { file: r.file }), 'ok'); }
          }, { iconName: 'export' }),
          button(t('backup.openFile'), async () => {
            const f = await window.ush.dialog('file', { filters: [{ name: 'ZIP', extensions: ['zip'] }] });
            if (f) openRestore(f);
          }, { iconName: 'import' })),
        backups.length ? el('table', null, el('tbody', null, backups.map((b) => el('tr', null, el('td', { class: 'mono small', text: b.name }), el('td', { class: 'small', text: fmtDate(b.createdAt) }), el('td', { class: 'small', text: fmtSize(b.size) }),
          el('td', null, button(t('backup.verify'), async () => { const v = await safe(() => call('verifyBackup', b.file)); if (v) toast(v.ok ? t('backup.valid') : t('backup.invalid', { e: v.errors.slice(0, 2).join(' ; ') }), v.ok ? 'ok' : 'bad'); }, { size: 'sm' }), ' ', button(t('restore'), () => openRestore(b.file), { size: 'sm' })))))) : el('p', { class: 'muted small', text: t('backup.none') })),
      el('div', { class: 'card stack' }, el('h2', { text: t('settings.categories') }),
        el('p', { class: 'small muted', text: t('cat.hint') }),
        el('div', { class: 'row' }, catName, el('div', { class: 'grow' }, catKw), button(t('add'), async () => {
          if (!catName.value.trim()) return;
          await safe(() => call('saveCategory', { label: catName.value.trim(), keywords: catKw.value }), t('saved'));
          await loadMeta(); render();
        }, { iconName: 'plus' })),
        el('table', null, el('tbody', null, cats.map((c) => {
          const kw = el('input', { type: 'text', value: (c.keywords || []).join(', '), style: 'width:100%' });
          return el('tr', null, el('td', { style: 'white-space:nowrap' }, el('strong', { text: c.label }), c.builtin ? el('div', { class: 'small muted', text: t('cat.builtin') }) : null), el('td', { style: 'width:70%' }, kw),
            el('td', { style: 'white-space:nowrap' }, button(t('save'), async () => { await safe(() => call('saveCategory', { id: c.id, label: c.label, keywords: kw.value }), t('saved')); await loadMeta(); }, { size: 'sm' }), ' ',
              button(t('delete'), async () => { if (!(await confirmDialog(t('cat.deleteConfirm', { name: c.label }), t('cat.deleteDetail'), { danger: true }))) return; await safe(() => call('deleteCategory', c.id), t('saved')); await loadMeta(); render(); }, { size: 'sm', kind: 'danger' })));
        }))))
    );
  }

  async function openRestore(file) {
    const body = el('div', { class: 'stack' }, el('div', { class: 'row muted' }, el('span', { class: 'spinner' }), t('loading')));
    const sel = { skills: new Set(), packs: true, settings: false, sources: false, destinations: false, categories: false, replaceExisting: false };
    modal({
      title: t('restore.title'), wide: true, body,
      footer: (close) => [button(t('cancel'), close), button(t('restore'), async (e) => {
        if (!(await confirmDialog(t('restore.confirm'), t('restore.confirmDetail')))) return;
        await busy(e.currentTarget, async () => {
          const r = await safe(() => call('restoreBackup', file, { ...sel, skills: [...sel.skills] }));
          if (r) { toast(t('restore.done', { n: r.restored.skills.length, s: r.restored.skippedExisting.length }), 'ok'); close(); await loadMeta(); render(); refreshCounts(); }
        });
      }, { kind: 'primary' })]
    });
    const v = await safe(() => call('verifyBackup', file));
    if (!v) return;
    if (!v.ok) return body.replaceChildren(el('div', { class: 'notice bad' }, el('strong', { text: t('backup.invalidTitle') }), v.errors.slice(0, 10).map((x) => el('div', { class: 'small', text: x }))));
    v.contents.skills.forEach((s) => sel.skills.add(s.id));
    const opt = (key) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: sel[key], onchange: (e) => { sel[key] = e.target.checked; } }), t(`restore.${key}`));
    body.replaceChildren(
      el('div', { class: 'notice', text: t('restore.info', { d: fmtDate(v.manifest.createdAt), n: v.contents.skills.length, p: v.contents.packs.length }) }),
      el('div', { class: 'row' }, opt('packs'), opt('settings'), opt('sources'), opt('destinations'), opt('categories'), opt('replaceExisting')),
      el('h3', { text: t('restore.skills') }),
      el('div', { class: 'stack', style: 'max-height:260px;overflow:auto;gap:2px' }, v.contents.skills.map((s) => el('label', { class: 'check small' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => (e.target.checked ? sel.skills.add(s.id) : sel.skills.delete(s.id)) }), s.name)))
    );
  }

  // ------------------------------------------------------------------ boot

  const VIEWS = { dashboard: viewDashboard, library: viewLibrary, packs: viewPacks, agents: viewAgents, sources: viewSources, history: viewHistory, security: viewSecurity, settings: viewSettings };

  function applyTheme(theme) {
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    window.ush.setTheme(theme);
  }

  async function loadMeta() {
    const [cats, packs, adapters, skills] = await Promise.all([call('listCategories'), call('listPacks'), call('adapters'), call('search', {})]);
    state.categories = cats;
    state.packs = packs;
    state.adapters = adapters;
    state.skillNames = Object.fromEntries(skills.map((s) => [s.id, s.name]));
  }

  async function boot() {
    state.settings = await call('getSettings');
    window.setLang(state.settings.language);
    applyTheme(state.settings.theme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.settings.theme));
    await loadMeta();
    const hash = location.hash.slice(1);
    if (VIEWS[hash]) state.view = hash;
    window.addEventListener('hashchange', () => {
      const h = location.hash.slice(1);
      if (VIEWS[h] && h !== state.view) { state.view = h; render(); }
    });
    const search = document.getElementById('global-search');
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.filters.query = search.value;
        if (state.view !== 'library') go('library');
        else render();
      }, 200);
    });
    window.ush.onEvent(async (ev) => {
      if (ev.type === 'scan' && (ev.summary?.new || ev.summary?.modified)) toast(t('toast.changes', { n: ev.summary.new + ev.summary.modified }));
      if (ev.type === 'error') toast(ev.message, 'bad');
      refreshCounts();
    });
    renderTopbar();
    await refreshCounts();
    render();
  }

  boot().catch((err) => view().replaceChildren(errorBox(err)));
})();
