(function () {
	'use strict';

	const SIDEBAR_LEAVE_DELAY_MS = 280;
	const MOBILE_BREAKPOINT = 768;

	let sidebarLeaveTimer = null;
	let outsideBound = false;

	function qs(sel, root) {
		return (root || document).querySelector(sel);
	}

	function isMobile() {
		return window.innerWidth < MOBILE_BREAKPOINT;
	}

	function setOpen(flag, on) {
		document.documentElement.classList.toggle(flag, on);
	}

	function findSidebarToggleIn(root) {
		if (!root) return null;
		const buttons = root.querySelectorAll('button[aria-label]');
		for (const button of buttons) {
			const label = button.getAttribute('aria-label') || '';
			if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) {
				return button;
			}
		}
		return root.querySelector('button');
	}

	function findNavbarSidebarButton() {
		const nav = qs('#chat-container nav.sticky.top-0');
		if (!nav) return null;
		const buttons = nav.querySelectorAll('button[aria-label]');
		for (const button of buttons) {
			const label = button.getAttribute('aria-label') || '';
			if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) {
				return button;
			}
		}
		return null;
	}

	function isSidebarExpanded(sidebar) {
		return sidebar?.getAttribute('data-state') === 'true';
	}

	function syncSidebarOpenClass() {
		const sidebar = qs('#sidebar');
		const open = Boolean(sidebar && isSidebarExpanded(sidebar));
		setOpen('custom-ui-sidebar-open', open);
		const btn = qs('#custom-ui-sidebar-btn');
		if (btn) btn.style.display = open ? 'none' : 'inline-flex';
	}

	function openSidebar() {
		const sidebar = qs('#sidebar');

		// Already open
		if (sidebar && isSidebarExpanded(sidebar)) {
			syncSidebarOpenClass();
			return;
		}

		// Mobile (and any case where collapsed icon-rail sidebar is absent):
		// use navbar sidebar toggle first.
		const navBtn = findNavbarSidebarButton();
		if (navBtn) {
			navBtn.click();
			window.setTimeout(syncSidebarOpenClass, 60);
			return;
		}

		if (sidebar) {
			findSidebarToggleIn(sidebar)?.click();
			window.setTimeout(syncSidebarOpenClass, 60);
			return;
		}

		// Last resort: click hidden helper if present
		qs('#sidebar-new-chat-button');
		syncSidebarOpenClass();
	}

	function closeSidebar() {
		const sidebar = qs('#sidebar');
		if (sidebar && isSidebarExpanded(sidebar)) {
			const toggle = findSidebarToggleIn(sidebar) || findNavbarSidebarButton();
			toggle?.click();
			window.setTimeout(syncSidebarOpenClass, 60);
			return;
		}
		syncSidebarOpenClass();
	}

	function openTopbar() {
		setOpen('custom-ui-topbar-open', true);
	}

	function closeTopbar() {
		setOpen('custom-ui-topbar-open', false);
	}

	function openInput() {
		setOpen('custom-ui-input-open', true);
		window.setTimeout(() => {
			const el = qs('#chat-input');
			if (el && typeof el.focus === 'function') el.focus();
		}, 30);
	}

	function closeInput() {
		const active = document.activeElement;
		const box = qs('#message-input-container');
		if (active && box && box.contains(active) && typeof active.blur === 'function') {
			active.blur();
		}
		setOpen('custom-ui-input-open', false);
	}

	function ensureSidebarButton() {
		let btn = qs('#custom-ui-sidebar-btn');
		if (btn) return btn;

		btn = document.createElement('button');
		btn.id = 'custom-ui-sidebar-btn';
		btn.type = 'button';
		btn.title = 'Open sidebar';
		btn.setAttribute('aria-label', 'Open sidebar');

		const img = document.createElement('img');
		img.src = '/static/favicon.png';
		img.alt = '';
		img.draggable = false;
		btn.appendChild(img);

		btn.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				closeTopbar();
				closeInput();
				openSidebar();
			},
			true
		);

		document.body.appendChild(btn);
		return btn;
	}

	function ensureTopbarHit() {
		let hit = qs('#custom-ui-topbar-hit');
		if (hit) return hit;

		hit = document.createElement('div');
		hit.id = 'custom-ui-topbar-hit';
		hit.setAttribute('aria-hidden', 'true');
		hit.addEventListener(
			'pointerdown',
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				closeSidebar();
				closeInput();
				openTopbar();
			},
			true
		);
		document.body.appendChild(hit);
		return hit;
	}

	function ensureInputHit() {
		let hit = qs('#custom-ui-input-hit');
		if (hit) return hit;

		hit = document.createElement('div');
		hit.id = 'custom-ui-input-hit';
		hit.setAttribute('aria-hidden', 'true');
		hit.addEventListener(
			'pointerdown',
			(event) => {
				event.preventDefault();
				event.stopPropagation();
				closeSidebar();
				closeTopbar();
				openInput();
			},
			true
		);
		document.body.appendChild(hit);
		return hit;
	}

	function setupSidebarRegion() {
		const sidebar = qs('#sidebar');
		if (!sidebar || sidebar.dataset.customRegionBound === '1') return;
		sidebar.dataset.customRegionBound = '1';

		sidebar.addEventListener('pointerdown', () => {
			closeTopbar();
			closeInput();
			setOpen('custom-ui-sidebar-open', true);
		});

		sidebar.addEventListener('mouseleave', () => {
			if (isMobile()) return;
			clearTimeout(sidebarLeaveTimer);
			sidebarLeaveTimer = window.setTimeout(() => closeSidebar(), SIDEBAR_LEAVE_DELAY_MS);
		});

		sidebar.addEventListener('mouseenter', () => {
			clearTimeout(sidebarLeaveTimer);
		});
	}

	function setupTopbarRegion() {
		const nav = qs('#chat-container nav.sticky.top-0');
		if (!nav || nav.dataset.customRegionBound === '1') return;
		nav.dataset.customRegionBound = '1';

		nav.addEventListener(
			'pointerdown',
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) return;

				// Don't steal clicks from sidebar toggle / custom btn
				if (target.closest('#custom-ui-sidebar-btn')) return;
				const label = target.closest('button')?.getAttribute('aria-label') || '';
				if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) return;

				closeSidebar();
				closeInput();
				openTopbar();
			},
			true
		);
	}

	function setupInputRegion() {
		const input = qs('#message-input-container');
		if (!input || input.dataset.customRegionBound === '1') return;
		input.dataset.customRegionBound = '1';

		input.addEventListener('pointerdown', () => {
			closeSidebar();
			closeTopbar();
			openInput();
		});

		input.addEventListener('focusin', () => {
			closeSidebar();
			closeTopbar();
			openInput();
		});
	}

	function onDocumentPointerDown(event) {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const inSidebar =
			Boolean(target.closest('#sidebar')) || Boolean(target.closest('#custom-ui-sidebar-btn'));
		const inTopbar =
			Boolean(target.closest('#chat-container nav.sticky.top-0')) ||
			Boolean(target.closest('#custom-ui-topbar-hit'));
		const inInput =
			Boolean(target.closest('#message-input-container')) ||
			Boolean(target.closest('#custom-ui-input-hit')) ||
			Boolean(target.closest('#chat-input'));

		if (!inSidebar) closeSidebar();
		if (!inTopbar) closeTopbar();
		if (!inInput) closeInput();
	}

	function bindOutsideOnce() {
		if (outsideBound) return;
		outsideBound = true;
		document.addEventListener('pointerdown', onDocumentPointerDown, true);
	}

	function updatePageState() {
		document.documentElement.classList.add('custom-ui-active');

		const hasMessages = Boolean(
			document.querySelector('#messages-container .message-listitem, .message-listitem')
		);
		document.documentElement.classList.toggle('custom-ui-has-messages', hasMessages);

		if (!hasMessages) {
			closeTopbar();
			closeInput();
		}

		syncSidebarOpenClass();
	}

	function bootstrap() {
		try {
			localStorage.sidebar = 'false';
		} catch (error) {
			/* ignore */
		}

		window.setTimeout(() => {
			closeSidebar();
			closeTopbar();
			closeInput();
			ensureSidebarButton();
			ensureTopbarHit();
			ensureInputHit();
			syncSidebarOpenClass();
		}, 250);
	}

	function init() {
		ensureSidebarButton();
		ensureTopbarHit();
		ensureInputHit();
		setupSidebarRegion();
		setupTopbarRegion();
		setupInputRegion();
		bindOutsideOnce();
		updatePageState();
		bootstrap();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}

	const observer = new MutationObserver(() => {
		ensureSidebarButton();
		ensureTopbarHit();
		ensureInputHit();
		setupSidebarRegion();
		setupTopbarRegion();
		setupInputRegion();
		updatePageState();
	});

	observer.observe(document.body, { childList: true, subtree: true });
})();
