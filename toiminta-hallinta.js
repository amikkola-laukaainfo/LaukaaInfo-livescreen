// =============================================================================
// toiminta-hallinta.js — Yhdistyksen itsenäinen hallintaportaali (toiminta.html)
// =============================================================================
// Näkyy vain yhdistyksen pääkäyttäjälle (board_chair) ja käsittelee myös
// hallinnan luovutuslinkit (?handover=HANDOVER-... / ?transfer=SIIRTO-...).
// =============================================================================
(function () {
    'use strict';

    let govPortalOpen = false;
    let govActiveSubTab = 'settings'; // settings | users | handover | privacy | export | closure
    let govCachedData = null;
    let govInvites = [];

    function getSb() {
        return window.LaukaaSupabase || window.supabaseClient || null;
    }

    function getSessionToken() {
        if (window.ROLE_SESSION && window.ROLE_SESSION.session_token) {
            return window.ROLE_SESSION.session_token;
        }
        const orgId = getOrgId();
        if (orgId) {
            try {
                const raw = localStorage.getItem('toiminta_role_session_' + orgId);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.session_token && (!parsed.expires_at || new Date(parsed.expires_at) > new Date())) {
                        window.ROLE_SESSION = parsed;
                        return parsed.session_token;
                    }
                }
            } catch (_) {}
        }
        return null;
    }

    function getOrgId() {
        return window.CURRENT_ORG_ID || new URLSearchParams(window.location.search).get('org') || '';
    }

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function roleLabelFi(roleType) {
        if (roleType === 'board_chair') return '👑 Pääkäyttäjä (PJ)';
        if (roleType === 'board_member') return '🛡️ Toimintavastaava (Hallitus)';
        if (roleType === 'secretary') return '📝 Toimintavastaava (Sihteeri)';
        if (roleType === 'coordinator') return '🧭 Toimintavastaava (Koordinaattori)';
        if (roleType === 'lead') return '⚡ Toimintavastaava (Vetäjä)';
        return '👤 Jäsen';
    }

    // -------------------------------------------------------------------------
    // 1. Hallinnan luovutuksen / PJ-siirron vastaanotto (?handover= / ?transfer=)
    // -------------------------------------------------------------------------
    function checkHandoverUrlParam() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('handover') || params.get('transfer');
        if (!token) return;
        const modal = document.getElementById('handover-accept-modal');
        const tokenInput = document.getElementById('handover-token-input');
        if (tokenInput) tokenInput.value = token.trim();
        if (modal) modal.classList.add('open');
    }

    window.closeHandoverAcceptModal = function () {
        const modal = document.getElementById('handover-accept-modal');
        if (modal) modal.classList.remove('open');
    };

    window.submitAcceptHandover = async function () {
        const token = (document.getElementById('handover-token-input')?.value || '').trim();
        const fullName = (document.getElementById('handover-name-input')?.value || '').trim();
        const email = (document.getElementById('handover-email-input')?.value || '').trim();
        const phone = (document.getElementById('handover-phone-input')?.value || '').trim();
        const termsOk = !!document.getElementById('handover-terms-checkbox')?.checked;
        const errEl = document.getElementById('handover-accept-error');
        const btn = document.getElementById('btn-submit-handover-accept');

        if (!token || !fullName) {
            if (errEl) { errEl.textContent = 'Aktivointitunnus ja vastuuhenkilön nimi ovat pakollisia.'; errEl.style.display = 'block'; }
            return;
        }
        if (!termsOk) {
            if (errEl) { errEl.textContent = 'Hyväksy palvelun toimintaperiaatteet jatkaaksesi.'; errEl.style.display = 'block'; }
            return;
        }

        const sb = getSb();
        if (!sb) return;
        if (btn) { btn.disabled = true; btn.textContent = 'Vahvistetaan...'; }
        if (errEl) errEl.style.display = 'none';

        try {
            const { data, error } = await sb.rpc('accept_org_handover', {
                p_handover_token: token,
                p_full_name: fullName,
                p_email: email || null,
                p_phone: phone || null,
                p_accept_terms: true
            });

            if (error || !data || !data.success) {
                const msg = (data && data.error) || (error && error.message) || 'Hallinnan vastaanotto epäonnistui.';
                if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
                if (btn) { btn.disabled = false; btn.textContent = '✅ Hyväksy hallintavastuu'; }
                return;
            }

            // Tallenna istunto ja näytä henkilökohtainen PJ-koodi
            const orgId = data.organization_id || getOrgId();
            const sessionObj = {
                session_token: data.session_token,
                session_id: data.session_id,
                member_id: data.member_id,
                member_name: data.member_name,
                active_roles: data.active_roles || [{ role: 'board_chair' }],
                expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
            };
            window.ROLE_SESSION = sessionObj;
            if (orgId) {
                localStorage.setItem('toiminta_role_session_' + orgId, JSON.stringify(sessionObj));
                localStorage.setItem('org_session_' + orgId, data.session_token);
            }
            if (data.member_name) {
                localStorage.setItem('toiminta_user_name', data.member_name);
            }

            const formView = document.getElementById('handover-view-form');
            const okView = document.getElementById('handover-view-success');
            const codeEl = document.getElementById('handover-personal-code');
            if (formView) formView.style.display = 'none';
            if (okView) okView.style.display = 'block';
            if (codeEl) codeEl.textContent = data.personal_code || '-';

            // Siivotaan ?handover= URL:sta
            try {
                const cleanUrl = window.location.pathname + (orgId ? ('?org=' + encodeURIComponent(orgId)) : '');
                window.history.replaceState({}, '', cleanUrl);
            } catch (_) {}

            if (typeof window.setRoleSession === 'function') {
                window.setRoleSession(sessionObj);
            } else if (typeof window.updateRoleBadge === 'function') {
                window.updateRoleBadge();
            }
            if (typeof window.fetchBoardData === 'function') await window.fetchBoardData();
        } catch (ex) {
            if (errEl) { errEl.textContent = 'Virhe: ' + ex.message; errEl.style.display = 'block'; }
            if (btn) { btn.disabled = false; btn.textContent = '✅ Hyväksy hallintavastuu'; }
        }
    };

    // -------------------------------------------------------------------------
    // 2. Näkymänvaihtaja: Toimintataulu <-> Yhdistyksen hallinta
    // -------------------------------------------------------------------------
    window.toggleOrgGovernancePortal = function (forceState) {
        const portal = document.getElementById('org-governance-portal');
        const mainBoard = document.querySelector('main.main-container');
        const btn = document.getElementById('btn-org-governance-portal');
        if (!portal || !mainBoard) return;

        govPortalOpen = typeof forceState === 'boolean' ? forceState : !govPortalOpen;

        if (govPortalOpen) {
            mainBoard.style.display = 'none';
            portal.style.display = 'block';
            if (btn) btn.innerHTML = '<span>📋</span> <span>Palaa taululle</span>';
            loadGovernancePortalData();
        } else {
            portal.style.display = 'none';
            mainBoard.style.display = '';
            if (btn) btn.innerHTML = '<span>⚙️</span> <span>Yhdistyksen hallinta</span>';
        }
    };

    window.setGovSubTab = function (tab) {
        govActiveSubTab = tab;
        renderGovernancePortal();
    };

    async function loadGovernancePortalData() {
        const sb = getSb();
        const token = getSessionToken();
        const orgId = getOrgId();
        const portal = document.getElementById('org-governance-portal');
        if (!portal) return;
        if (!sb || !token || !orgId) {
            portal.innerHTML = `<div style="max-width:720px;margin:2rem auto;padding:1.5rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:14px;color:#fca5a5;">
                <div style="font-weight:700;margin-bottom:0.5rem;">⚠️ Hallintaportaalia ei voitu avata</div>
                <div style="font-size:0.85rem;margin-bottom:1rem;">Puuttuva kirjautumisistunto tai yhdistystunnus. Kirjaudu ensin hallituksen puheenjohtajan henkilökohtaisella koodilla.</div>
                <button onclick="toggleOrgGovernancePortal(false)" style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:8px;padding:0.5rem 0.9rem;cursor:pointer;font-weight:700;">← Takaisin toimintataululle</button>
            </div>`;
            return;
        }

        portal.innerHTML = '<div style="max-width:960px;margin:2rem auto;padding:2rem;text-align:center;color:#94a3b8;">Ladataan yhdistyksen hallintatietoja...</div>';

        try {
            const [govRes, invRes] = await Promise.all([
                sb.rpc('get_organization_governance_data', {
                    p_session_token: token,
                    p_organization_id: orgId
                }),
                sb.rpc('get_organization_invites', {
                    p_organization_id: orgId,
                    p_session_token: token
                })
            ]);

            if (govRes.error || !govRes.data || !govRes.data.success) {
                const msg = (govRes.data && govRes.data.error) || (govRes.error && govRes.error.message) || 'Hallintatietojen lataus epäonnistui.';
                portal.innerHTML = `<div style="max-width:720px;margin:2rem auto;padding:1.5rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:14px;color:#fca5a5;">⚠️ ${esc(msg)}</div>`;
                return;
            }

            govCachedData = govRes.data;
            govInvites = (invRes.data && invRes.data.invites) ? invRes.data.invites : [];
            renderGovernancePortal();
        } catch (ex) {
            portal.innerHTML = `<div style="max-width:720px;margin:2rem auto;padding:1.5rem;color:#fca5a5;">Virhe: ${esc(ex.message)}</div>`;
        }
    }

    function renderGovernancePortal() {
        const portal = document.getElementById('org-governance-portal');
        if (!portal) return;

        const bd = window.BOARD_DATA || {};
        const orgName = bd.organization_name || getOrgId();
        const tabs = [
            { id: 'settings', label: '⚙️ Asetukset' },
            { id: 'users', label: '👥 Käyttäjät & oikeudet' },
            { id: 'handover', label: '🤝 Luovuta hallinta' },
            { id: 'privacy', label: '🛡️ Tietosuoja & elinkaari' },
            { id: 'export', label: '📦 Omat tiedot (Vienti)' },
            { id: 'closure', label: '🚪 Lopeta käyttö' }
        ];

        const navHtml = tabs.map(t => {
            const active = govActiveSubTab === t.id;
            return `<button onclick="setGovSubTab('${t.id}')" style="padding:0.55rem 0.95rem;border-radius:10px;border:1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'};background:${active ? 'rgba(99,102,241,0.22)' : 'rgba(15,23,42,0.55)'};color:${active ? '#fff' : '#94a3b8'};font-size:0.82rem;font-weight:700;cursor:pointer;">${t.label}</button>`;
        }).join('');

        let bodyHtml = '';
        if (govActiveSubTab === 'settings') bodyHtml = renderSettingsTab(bd);
        else if (govActiveSubTab === 'users') bodyHtml = renderUsersTab();
        else if (govActiveSubTab === 'handover') bodyHtml = renderHandoverTab(bd);
        else if (govActiveSubTab === 'privacy') bodyHtml = renderPrivacyTab(bd);
        else if (govActiveSubTab === 'export') bodyHtml = renderExportTab();
        else if (govActiveSubTab === 'closure') bodyHtml = renderClosureTab(bd);

        portal.innerHTML = `
            <div style="max-width:1020px;margin:1.5rem auto 3rem auto;padding:0 1rem;">
                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:1.4rem 1.6rem;margin-bottom:1.25rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
                        <div>
                            <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#a5b4fc;">YHDISTYKSEN OMA HALLINTAPORTAALI</div>
                            <h2 style="font-family:'Outfit',sans-serif;font-size:1.45rem;font-weight:800;color:#fff;margin:0.2rem 0 0 0;">${esc(orgName)}</h2>
                        </div>
                        <button onclick="toggleOrgGovernancePortal(false)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e2e8f0;border-radius:10px;padding:0.5rem 0.9rem;font-size:0.8rem;font-weight:700;cursor:pointer;">← Takaisin toimintataululle</button>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1.1rem;">${navHtml}</div>
                </div>
                <div id="gov-portal-feedback" style="display:none;margin-bottom:1rem;padding:0.85rem 1.1rem;border-radius:12px;font-size:0.85rem;"></div>
                ${bodyHtml}
            </div>
        `;
    }

    function showGovFeedback(ok, msg) {
        const el = document.getElementById('gov-portal-feedback');
        if (!el) return;
        el.style.display = 'block';
        el.style.background = ok ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
        el.style.border = ok ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(239,68,68,0.35)';
        el.style.color = ok ? '#6ee7b7' : '#fca5a5';
        el.textContent = (ok ? '✅ ' : '⚠️ ') + msg;
    }

    // -------------------------------------------------------------------------
    // VÄLILEHTI 1: ASETUKSET
    // -------------------------------------------------------------------------
    function renderSettingsTab(bd) {
        const isProtected = bd.board_visibility === 'code_protected';
        return `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;">
                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.75rem 0;color:#fff;font-size:1.05rem;">🏷️ Yhdistyksen perustiedot</h3>
                    <label style="display:block;font-size:0.78rem;color:#94a3b8;margin-bottom:0.3rem;">Yhdistyksen nimi</label>
                    <input id="gov-set-org-name" type="text" value="${esc(bd.organization_name || '')}" style="width:100%;box-sizing:border-box;padding:0.6rem 0.85rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;margin-bottom:0.85rem;" />
                    <button onclick="saveGovBasicSettings()" style="background:#6366f1;color:#fff;border:none;border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">💾 Tallenna nimi</button>
                </div>

                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.75rem 0;color:#fff;font-size:1.05rem;">🔒 Taulun näkyvyys & yleiskoodi</h3>
                    <select id="gov-set-visibility" style="width:100%;padding:0.6rem 0.85rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;margin-bottom:0.65rem;">
                        <option value="public" ${!isProtected ? 'selected' : ''}>🌐 Julkinen (avoin kaikille)</option>
                        <option value="code_protected" ${isProtected ? 'selected' : ''}>🔒 Vain jäsenille (yleiskoodi)</option>
                    </select>
                    <input id="gov-set-access-code" type="text" placeholder="Uusi yleiskoodi (esim. LAUKAA26)" style="width:100%;box-sizing:border-box;padding:0.6rem 0.85rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;margin-bottom:0.85rem;text-transform:uppercase;" />
                    <button onclick="saveGovAccessSettings()" style="background:#0ea5e9;color:#fff;border:none;border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">🔐 Tallenna suojaus</button>
                </div>

                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.05rem;">📹 Virtuaalikokous & ohjekortti</h3>
                    <p style="font-size:0.8rem;color:#94a3b8;margin:0 0 0.85rem 0;">Muokkaa Google Meet -kokouslinkkiä ja seuraavan kokouksen ajankohtaa.</p>
                    <button onclick="if(typeof openMeetingEditModal==='function') openMeetingEditModal();" style="background:#10b981;color:#fff;border:none;border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">📹 Muokkaa kokoustietoja</button>
                </div>
            </div>
        `;
    }

    window.saveGovBasicSettings = async function () {
        const name = (document.getElementById('gov-set-org-name')?.value || '').trim();
        const sb = getSb();
        if (!sb || !name) return;
        const { data, error } = await sb.rpc('update_org_self_settings', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_name: name
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Tallennus epäonnistui.');
        showGovFeedback(true, 'Yhdistyksen nimi tallennettu.');
        if (typeof window.fetchBoardData === 'function') await window.fetchBoardData();
    };

    window.saveGovAccessSettings = async function () {
        const vis = document.getElementById('gov-set-visibility')?.value || 'public';
        const code = (document.getElementById('gov-set-access-code')?.value || '').trim().toUpperCase();
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('update_organization_board_access', {
            p_organization_id: getOrgId(),
            p_board_visibility: vis,
            p_board_access_code: code || null,
            p_session_token: getSessionToken()
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Suojauksen tallennus epäonnistui.');
        showGovFeedback(true, 'Taulun näkyvyys ja yleiskoodi päivitetty.');
        if (typeof window.fetchBoardData === 'function') await window.fetchBoardData();
    };

    // -------------------------------------------------------------------------
    // VÄLILEHTI 2: KÄYTTÄJÄT & OIKEUDET
    // -------------------------------------------------------------------------
    function renderUsersTab() {
        const members = (govCachedData && govCachedData.members) ? govCachedData.members : [];
        const rows = members.map(m => {
            const activeRoles = (m.roles || []).filter(r => r.is_active);
            const roleText = activeRoles.length ? activeRoles.map(r => roleLabelFi(r.role_type)).join(', ') : '👤 Jäsen';
            const firstRole = activeRoles[0];
            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
                    <td style="padding:0.7rem 0.5rem;color:#fff;font-weight:700;">${esc(m.full_name)}<div style="font-size:0.72rem;color:#94a3b8;font-weight:400;">${esc(m.email || '')} ${esc(m.phone || '')}</div></td>
                    <td style="padding:0.7rem 0.5rem;font-size:0.8rem;color:#cbd5e1;">${roleText}</td>
                    <td style="padding:0.7rem 0.5rem;text-align:right;white-space:nowrap;">
                        <select onchange="govChangeRole('${m.id}', this.value)" style="background:rgba(15,23,42,0.8);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:0.3rem 0.45rem;font-size:0.75rem;margin-right:0.35rem;">
                            <option value="">Vaihda rooli...</option>
                            <option value="board_chair">👑 Pääkäyttäjä</option>
                            <option value="board_member">🛡️ Toimintavastaava</option>
                            <option value="secretary">📝 Sihteeri</option>
                            <option value="member">👤 Jäsen</option>
                        </select>
                        <button onclick="govGenCode('${m.id}', '${esc(m.full_name)}')" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.35);border-radius:8px;padding:0.3rem 0.55rem;font-size:0.75rem;cursor:pointer;margin-right:0.3rem;" title="Luo uusi valtuuskoodi">🔑 Koodi</button>
                        ${firstRole ? `<button onclick="govRevokeRole('${firstRole.id}')" style="background:rgba(245,158,11,0.18);color:#fcd34d;border:1px solid rgba(245,158,11,0.35);border-radius:8px;padding:0.3rem 0.55rem;font-size:0.75rem;cursor:pointer;margin-right:0.3rem;" title="Poista rooli">Poista rooli</button>` : ''}
                        <button onclick="govDeactivateMember('${m.id}', '${esc(m.full_name)}')" style="background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);border-radius:8px;padding:0.3rem 0.55rem;font-size:0.75rem;cursor:pointer;">Poista</button>
                    </td>
                </tr>
            `;
        }).join('');

        const invRows = govInvites.filter(i => i.is_active).map(inv => {
            const url = window.location.origin + window.location.pathname + '?org=' + encodeURIComponent(getOrgId()) + '&invite=' + encodeURIComponent(inv.code);
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.55rem 0.75rem;background:rgba(15,23,42,0.5);border-radius:10px;margin-bottom:0.4rem;flex-wrap:wrap;">
                    <div style="font-size:0.8rem;color:#e2e8f0;"><strong>${esc(inv.title || inv.code)}</strong> · ${roleLabelFi(inv.role_type)} · Käytetty ${inv.uses_count}${inv.max_uses ? '/' + inv.max_uses : ''}</div>
                    <div style="display:flex;gap:0.4rem;">
                        <button onclick="navigator.clipboard.writeText('${esc(url)}');showGovFeedbackMsg(true,'Kutsulinkki kopioitu leikepöydälle!');" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:0.3rem 0.6rem;font-size:0.75rem;font-weight:700;cursor:pointer;">📋 Kopioi linkki</button>
                        <button onclick="govRevokeInvite('${inv.id}')" style="background:rgba(239,68,68,0.2);color:#fca5a5;border:none;border-radius:8px;padding:0.3rem 0.6rem;font-size:0.75rem;cursor:pointer;">Mitätöi</button>
                    </div>
                </div>
            `;
        }).join('') || '<p style="font-size:0.8rem;color:#94a3b8;">Ei aktiivisia kutsulinkkejä.</p>';

        return `
            <div style="display:flex;flex-direction:column;gap:1rem;">
                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.75rem 0;color:#fff;font-size:1.05rem;">✉️ Kutsu jäsen tai toimintavastaava</h3>
                    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
                        <input id="gov-inv-title" type="text" placeholder="Kutsun otsikko (esim. Hallitus 2027)" style="flex:1;min-width:180px;padding:0.55rem 0.8rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;font-size:0.82rem;" />
                        <select id="gov-inv-role" style="padding:0.55rem 0.8rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;font-size:0.82rem;">
                            <option value="">👤 Jäsen</option>
                            <option value="board_member">🛡️ Toimintavastaava (Hallitus)</option>
                            <option value="secretary">📝 Sihteeri</option>
                            <option value="board_chair">👑 Pääkäyttäjä (PJ)</option>
                        </select>
                        <button onclick="govCreateInvite()" style="background:#10b981;color:#fff;border:none;border-radius:10px;padding:0.55rem 1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">➕ Luo kutsulinkki</button>
                    </div>
                    <div style="margin-top:0.85rem;">${invRows}</div>
                </div>

                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;overflow-x:auto;">
                    <h3 style="margin:0 0 0.75rem 0;color:#fff;font-size:1.05rem;">👥 Jäsenet ja roolit (${members.length})</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead><tr style="text-align:left;color:#94a3b8;font-size:0.75rem;border-bottom:1px solid rgba(255,255,255,0.12);"><th style="padding:0.5rem;">Nimi</th><th style="padding:0.5rem;">Rooli</th><th style="padding:0.5rem;text-align:right;">Toiminnot</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="3" style="padding:1rem;color:#94a3b8;">Ei jäseniä.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    window.showGovFeedbackMsg = showGovFeedback;

    window.govCreateInvite = async function () {
        const title = (document.getElementById('gov-inv-title')?.value || '').trim() || 'Kutsulinkki';
        const role = document.getElementById('gov-inv-role')?.value || null;
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('create_organization_invite', {
            p_organization_id: getOrgId(),
            p_title: title,
            p_role_type: role || null,
            p_max_uses: null,
            p_expires_days: 30,
            p_session_token: getSessionToken()
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Kutsun luonti epäonnistui.');
        showGovFeedback(true, 'Kutsulinkki luotu!');
        await loadGovernancePortalData();
    };

    window.govRevokeInvite = async function (inviteId) {
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('revoke_organization_invite', {
            p_invite_id: inviteId,
            p_session_token: getSessionToken()
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Mitätöinti epäonnistui.');
        showGovFeedback(true, 'Kutsu mitätöity.');
        await loadGovernancePortalData();
    };

    window.govChangeRole = async function (memberId, roleType) {
        if (!roleType) return;
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('assign_organization_role', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_member_id: memberId,
            p_role_type: roleType,
            p_scope_item_id: null
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Roolin vaihto epäonnistui.');
        showGovFeedback(true, 'Rooli päivitetty.');
        await loadGovernancePortalData();
    };

    window.govRevokeRole = async function (assignmentId) {
        const sb = getSb();
        if (!sb || !confirm('Poistetaanko tämä rooli jäseneltä?')) return;
        const { data, error } = await sb.rpc('revoke_organization_role', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_role_assignment_id: assignmentId
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Roolin poisto epäonnistui.');
        showGovFeedback(true, 'Rooli poistettu.');
        await loadGovernancePortalData();
    };

    window.govGenCode = async function (memberId, memberName) {
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('generate_role_credential', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_member_id: memberId
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Koodin luonti epäonnistui.');
        alert(`Uusi valtuuskoodi henkilölle ${memberName}:\n\n${data.role_code}\n\nToimita tämä koodi hänelle suojatusti.`);
        await loadGovernancePortalData();
    };

    window.govDeactivateMember = async function (memberId, memberName) {
        const sb = getSb();
        if (!sb || !confirm(`Poistetaanko jäsenen "${memberName}" käyttöoikeus tästä yhdistyksestä?`)) return;
        const { data, error } = await sb.rpc('deactivate_organization_member', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_member_id: memberId
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Poisto epäonnistui.');
        showGovFeedback(true, `${memberName} poistettu aktiivisista käyttäjistä.`);
        await loadGovernancePortalData();
    };

    // -------------------------------------------------------------------------
    // VÄLILEHTI 3: LUOVUTA HALLINTA & TUETTU TILA
    // -------------------------------------------------------------------------
    function renderHandoverTab() {
        return `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:1rem;">
                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.05rem;">🤝 Luovuta pääkäyttäjän vastuu seuraajalle</h3>
                    <p style="font-size:0.8rem;color:#94a3b8;line-height:1.5;margin:0 0 0.9rem 0;">
                        Luo kertakäyttöinen siirtolinkki uudelle puheenjohtajalle tai vastuuhenkilölle. Aineisto ja asetukset säilyvät sellaisenaan ilman LaukaaInfon manuaalista työtä.
                    </p>
                    <input id="gov-transfer-name" type="text" placeholder="Uuden pääkäyttäjän nimi" style="width:100%;box-sizing:border-box;padding:0.55rem 0.85rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;margin-bottom:0.55rem;" />
                    <input id="gov-transfer-email" type="email" placeholder="Sähköposti (valinnainen)" style="width:100%;box-sizing:border-box;padding:0.55rem 0.85rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;margin-bottom:0.65rem;" />
                    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:#cbd5e1;margin-bottom:0.9rem;cursor:pointer;">
                        <input id="gov-transfer-remove-old" type="checkbox" /> Poista oma pääkäyttäjäroolini kun uusi vastuuhenkilö vahvistaa siirron
                    </label>
                    <button onclick="govInitiateChairTransfer()" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:10px;padding:0.65rem 1.1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">🔗 Luo hallinnansiirtolinkki</button>
                    <div id="gov-transfer-result" style="display:none;margin-top:0.85rem;padding:0.75rem;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:10px;font-size:0.78rem;color:#a7f3d0;word-break:break-all;"></div>
                </div>

                <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;">
                    <h3 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.05rem;">🛟 Tekninen tuki (Tuettu tila)</h3>
                    <p style="font-size:0.8rem;color:#94a3b8;line-height:1.5;margin:0 0 0.9rem 0;">
                        Oletuksena yhdistys on <strong>itsenäisessä tilassa</strong>: LaukaaInfon teknisellä ylläpidolla ei ole pääsyä yhdistyksen jäsentietoihin eikä taulun sisältöön. Voit halutessasi avata määräaikaisen 48 tunnin teknisen tuen ja sulkea sen milloin tahansa.
                    </p>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <button onclick="govSetSupportAccess(true)" style="background:#0ea5e9;color:#fff;border:none;border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.8rem;cursor:pointer;">🔓 Salli tuki 48 h</button>
                        <button onclick="govSetSupportAccess(false)" style="background:rgba(255,255,255,0.1);color:#e2e8f0;border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.8rem;cursor:pointer;">🔒 Lukitse itsenäiseksi</button>
                    </div>
                </div>
            </div>
        `;
    }

    window.govInitiateChairTransfer = async function () {
        const name = (document.getElementById('gov-transfer-name')?.value || '').trim();
        const email = (document.getElementById('gov-transfer-email')?.value || '').trim();
        const removeOld = !!document.getElementById('gov-transfer-remove-old')?.checked;
        if (!name) return showGovFeedback(false, 'Syötä uuden pääkäyttäjän nimi.');

        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('initiate_chair_transfer', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_target_name: name,
            p_target_email: email || null,
            p_remove_previous_chair: removeOld
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Siirtolinkin luonti epäonnistui.');

        const link = window.location.origin + window.location.pathname + '?org=' + encodeURIComponent(getOrgId()) + '&transfer=' + encodeURIComponent(data.transfer_token);
        const box = document.getElementById('gov-transfer-result');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = `<strong>Siirtolinkki (voimassa 7 vrk):</strong><br>${esc(link)}<br><button onclick="navigator.clipboard.writeText('${esc(link)}');showGovFeedbackMsg(true,'Siirtolinkki kopioitu!');" style="margin-top:0.5rem;background:#10b981;color:#fff;border:none;border-radius:8px;padding:0.35rem 0.7rem;font-weight:700;cursor:pointer;">📋 Kopioi linkki</button>`;
        }
        showGovFeedback(true, 'Hallinnansiirtolinkki luotu!');
    };

    window.govSetSupportAccess = async function (enable) {
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('set_org_support_access', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_enable: enable,
            p_hours: 48
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Tukitilan päivitys epäonnistui.');
        showGovFeedback(true, enable ? 'Määräaikainen tekninen tuki avattu 48 tunniksi.' : 'Yhdistys lukittu täysin itsenäiseen tilaan.');
    };

    // -------------------------------------------------------------------------
    // VÄLILEHTI 4: TIETOSUOJA & ELINKAARI
    // -------------------------------------------------------------------------
    function renderPrivacyTab() {
        return `
            <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;max-width:680px;">
                <h3 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.05rem;">🛡️ Tietojen säilytysajat & elinkaari</h3>
                <p style="font-size:0.8rem;color:#94a3b8;margin:0 0 1rem 0;">Määrittele kuinka kauan keskusteluja ja suljettuja asioita säilytetään aktiivisena ennen automaattista arkistointia/poistoa.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
                    <div>
                        <label style="display:block;font-size:0.78rem;color:#cbd5e1;margin-bottom:0.3rem;">Kommenttien säilytys (vrk)</label>
                        <input id="gov-ret-comments" type="number" min="30" max="3650" placeholder="esim. 365 (tyhjä = pysyvä)" style="width:100%;box-sizing:border-box;padding:0.55rem 0.8rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;" />
                    </div>
                    <div>
                        <label style="display:block;font-size:0.78rem;color:#cbd5e1;margin-bottom:0.3rem;">Valmiiden asioiden säilytys (vrk)</label>
                        <input id="gov-ret-closed" type="number" min="30" max="3650" placeholder="esim. 730 (tyhjä = pysyvä)" style="width:100%;box-sizing:border-box;padding:0.55rem 0.8rem;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(15,23,42,0.7);color:#fff;" />
                    </div>
                </div>
                <button onclick="govSaveRetention()" style="background:#6366f1;color:#fff;border:none;border-radius:10px;padding:0.6rem 1rem;font-weight:700;font-size:0.82rem;cursor:pointer;">💾 Tallenna säilytysajat</button>
            </div>
        `;
    }

    window.govSaveRetention = async function () {
        const cVal = document.getElementById('gov-ret-comments')?.value;
        const iVal = document.getElementById('gov-ret-closed')?.value;
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('update_org_self_settings', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_name: null,
            p_retention_days_comments: cVal ? parseInt(cVal, 10) : null,
            p_retention_days_closed_items: iVal ? parseInt(iVal, 10) : null
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Tallennus epäonnistui.');
        showGovFeedback(true, 'Tietojen säilytysajat tallennettu.');
    };

    // -------------------------------------------------------------------------
    // VÄLILEHTI 5: OMAT TIEDOT (VIENTI)
    // -------------------------------------------------------------------------
    function renderExportTab() {
        return `
            <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:1.25rem;max-width:680px;">
                <h3 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.05rem;">📦 Lataa yhdistyksen omat tiedot</h3>
                <p style="font-size:0.8rem;color:#94a3b8;line-height:1.5;margin:0 0 1rem 0;">
                    Voit ladata yhdistyksen kaikki asiat, päätökset, kommentit, asetukset ja jäsenrekisterin milloin tahansa koneluettavassa muodossa.
                </p>
                <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                    <button onclick="govDownloadExport('json')" style="background:#10b981;color:#fff;border:none;border-radius:10px;padding:0.65rem 1.1rem;font-weight:700;font-size:0.85rem;cursor:pointer;">⬇️ Lataa täydellinen JSON-arkisto</button>
                    <button onclick="govDownloadExport('csv')" style="background:#0ea5e9;color:#fff;border:none;border-radius:10px;padding:0.65rem 1.1rem;font-weight:700;font-size:0.85rem;cursor:pointer;">📊 Lataa asiat & jäsenet (CSV)</button>
                </div>
            </div>
        `;
    }

    window.govDownloadExport = async function (format) {
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('export_org_board_data', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId()
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Vienti epäonnistui.');

        const orgSlug = getOrgId().replace(/[^a-z0-9_-]/gi, '_');
        if (format === 'json') {
            downloadBlob(JSON.stringify(data, null, 2), `yhdistys_${orgSlug}_vienti.json`, 'application/json');
        } else {
            const lines = ['Tyyppi;Otsikko;Tila;Lisätieto;Luotu'];
            (data.board_items || []).forEach(it => {
                lines.push(['Asia', it.title, it.stage, it.decision_summary || '', it.created_at].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';'));
            });
            (data.members || []).forEach(m => {
                lines.push(['Jäsen', m.full_name, m.is_active ? 'Aktiivinen' : 'Passiivinen', m.email || m.phone || '', m.created_at].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';'));
            });
            downloadBlob('\uFEFF' + lines.join('\n'), `yhdistys_${orgSlug}_vienti.csv`, 'text/csv;charset=utf-8');
        }
        showGovFeedback(true, 'Aineisto viety onnistuneesti.');
    };

    function downloadBlob(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // -------------------------------------------------------------------------
    // VÄLILEHTI 6: PALVELUN LOPETTAMINEN (3-VAIHEINEN)
    // -------------------------------------------------------------------------
    function renderClosureTab() {
        return `
            <div style="background:rgba(30,41,59,0.85);border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:1.35rem;max-width:720px;display:flex;flex-direction:column;gap:1rem;">
                <div>
                    <h3 style="margin:0 0 0.35rem 0;color:#fca5a5;font-size:1.1rem;">🚪 Lopeta Toimintataulun käyttö</h3>
                    <p style="font-size:0.82rem;color:#cbd5e1;margin:0;">Voit ottaa yhdistyksen tiedot talteen ja sulkea tai poistaa palvelun itsenäisesti ilman LaukaaInfon tukipyyntöä.</p>
                </div>

                <div style="padding:0.9rem;background:rgba(15,23,42,0.55);border-radius:12px;">
                    <strong style="color:#fff;font-size:0.88rem;">Vaihe 1 – Lataa omat tiedot</strong>
                    <p style="font-size:0.78rem;color:#94a3b8;margin:0.25rem 0 0.6rem 0;">Suosittelemme lataamaan täydellisen JSON-arkiston ennen sulkemista.</p>
                    <button onclick="govDownloadExport('json')" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:0.45rem 0.85rem;font-size:0.78rem;font-weight:700;cursor:pointer;">⬇️ Lataa JSON-varmuuskopio</button>
                </div>

                <div style="padding:0.9rem;background:rgba(15,23,42,0.55);border-radius:12px;">
                    <strong style="color:#fff;font-size:0.88rem;">Vaihe 2 – Sulje taulu käytöstä</strong>
                    <p style="font-size:0.78rem;color:#94a3b8;margin:0.25rem 0 0.6rem 0;">Sulkeminen estää uudet kirjautumiset, mutta säilyttää aineiston vientiä varten.</p>
                    <button onclick="govClosureAction('close_now')" style="background:#f59e0b;color:#111827;border:none;border-radius:8px;padding:0.45rem 0.85rem;font-size:0.78rem;font-weight:800;cursor:pointer;">⏸️ Sulje toimintataulu nyt</button>
                </div>

                <div style="padding:0.9rem;background:rgba(127,29,29,0.22);border:1px solid rgba(239,68,68,0.35);border-radius:12px;">
                    <strong style="color:#fca5a5;font-size:0.88rem;">Vaihe 3 – Poista yhdistyksen tiedot pysyvästi</strong>
                    <p style="font-size:0.78rem;color:#fecaca;margin:0.25rem 0 0.6rem 0;">Poistaa asiat, kommentit, kutsut ja jäsenrekisterin aktiivisesta tietokannasta. Toimintoa ei voi perua.</p>
                    <button onclick="govClosureAction('purge_data')" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:0.45rem 0.85rem;font-size:0.78rem;font-weight:800;cursor:pointer;">🗑️ Poista kaikki yhdistyksen tiedot</button>
                </div>
            </div>
        `;
    }

    window.govClosureAction = async function (action) {
        if (action === 'close_now' && !confirm('Suljetaanko toimintataulu nyt?')) return;
        if (action === 'purge_data') {
            const check = prompt('Kirjoita POISTA vahvistaaksesi yhdistyksen kaikkien tietojen pysyvän poiston:');
            if (check !== 'POISTA') return;
        }
        const sb = getSb();
        if (!sb) return;
        const { data, error } = await sb.rpc('schedule_or_execute_org_closure', {
            p_session_token: getSessionToken(),
            p_organization_id: getOrgId(),
            p_action: action
        });
        if (error || !data?.success) return showGovFeedback(false, data?.error || error?.message || 'Toiminto epäonnistui.');
        showGovFeedback(true, action === 'purge_data' ? 'Yhdistyksen tiedot poistettu.' : 'Toimintataulu suljettu.');
    };

    // Käynnistetään URL-tarkistus kun DOM on valmis
    document.addEventListener('DOMContentLoaded', checkHandoverUrlParam);
})();

