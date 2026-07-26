(function () {
	'use strict';

	const SIDEBAR_LEAVE_DELAY_MS = 280;
	const MOBILE_BREAKPOINT = 768;

	let sidebarLeaveTimer = null;
	let outsideBound = false;
	let sidebarToggleLock = false;

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
			if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) return button;
		}
		return null;
	}

	/**
	 * Mobile navbar toggle has Tooltip text but NO aria-label.
	 * Find it by structure: first flex-none block before the model selector.
	 */
	function findMobileNavbarSidebarButton() {
		const nav = qs('#chat-container nav.sticky.top-0');
		if (!nav) return null;

		const labeled = findSidebarToggleIn(nav);
		if (labeled) return labeled;

		const rows = nav.querySelectorAll('.flex.items-center.w-full');
		for (const row of rows) {
			for (const child of Array.from(row.children)) {
				if (child.classList.contains('flex-1') || child.className.includes('flex-1')) break;
				const btn = child.querySelector('button');
				if (btn) return btn;
			}
		}

		// Fallback: first nav button that is not in right controls / model selector
		const right = nav.querySelector('.self-start.flex.flex-none');
		const modelBox = nav.querySelector('.flex-1.overflow-hidden');
		for (const button of nav.querySelectorAll('button')) {
			if (right && right.contains(button)) continue;
			if (modelBox && modelBox.contains(button)) continue;
			return button;
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

	function toggleSidebarViaShortcut() {
		// Open WebUI global shortcut: mod+shift+S
		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 's',
				code: 'KeyS',
				ctrlKey: true,
				metaKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true
			})
		);
	}

	function withToggleLock(fn) {
		if (sidebarToggleLock) return;
		sidebarToggleLock = true;
		try {
			fn();
		} finally {
			window.setTimeout(() => {
				sidebarToggleLock = false;
				syncSidebarOpenClass();
			}, 120);
		}
	}

	function openSidebar() {
		withToggleLock(() => {
			const sidebar = qs('#sidebar');
			if (sidebar && isSidebarExpanded(sidebar)) {
				syncSidebarOpenClass();
				return;
			}

			const mobileBtn = findMobileNavbarSidebarButton();
			if (mobileBtn) {
				mobileBtn.click();
				return;
			}

			if (sidebar) {
				const toggle = findSidebarToggleIn(sidebar) || sidebar.querySelector('button');
				if (toggle) {
					toggle.click();
					return;
				}
			}

			toggleSidebarViaShortcut();
		});
	}

	function closeSidebar() {
		withToggleLock(() => {
			const sidebar = qs('#sidebar');
			if (!(sidebar && isSidebarExpanded(sidebar))) {
				syncSidebarOpenClass();
				return;
			}

			const toggle =
				findSidebarToggleIn(sidebar) ||
				findMobileNavbarSidebarButton() ||
				sidebar.querySelector('button');

			if (toggle) {
				toggle.click();
				return;
			}

			toggleSidebarViaShortcut();
		});
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
		if (btn) {
			// Re-bind if older version lacked touch handler
			if (btn.dataset.customBound === '1') return btn;
		} else {
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
			document.body.appendChild(btn);
		}

		btn.dataset.customBound = '1';

		const activate = (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === 'function') {
				event.stopImmediatePropagation();
			}
			closeTopbar();
			closeInput();
			openSidebar();
		};

		// pointerup is more reliable than click on some mobile browsers
		btn.addEventListener('pointerup', activate, true);
		btn.addEventListener('click', activate, true);

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
				if (target.closest('#custom-ui-sidebar-btn')) return;

				const btn = target.closest('button');
				const label = btn?.getAttribute('aria-label') || '';
				if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) return;

				// Ignore the structural mobile sidebar toggle button
				const mobileToggle = findMobileNavbarSidebarButton();
				if (mobileToggle && (btn === mobileToggle || mobileToggle.contains(target))) return;

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

		// Never treat the activate gesture on our button as "outside"
		if (target.closest('#custom-ui-sidebar-btn')) return;

		const inSidebar = Boolean(target.closest('#sidebar'));
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
