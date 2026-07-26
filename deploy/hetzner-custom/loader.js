(function () {
	'use strict';

	const SIDEBAR_LEAVE_DELAY_MS = 280;
	const MOBILE_BREAKPOINT = 768;
	const OBSERVER_DEBOUNCE_MS = 120;

	let sidebarLeaveTimer = null;
	let outsideBound = false;
	let sidebarToggleLock = false;
	let observerTimer = null;
	let bootstrapped = false;

	function qs(sel, root) {
		return (root || document).querySelector(sel);
	}

	function isMobile() {
		return window.innerWidth < MOBILE_BREAKPOINT;
	}

	function setOpen(flag, on) {
		document.documentElement.classList.toggle(flag, on);
	}

	function isVisible(el) {
		if (!el) return false;
		const style = window.getComputedStyle(el);
		if (style.display === 'none' || style.visibility === 'hidden') return false;
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
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

	function clickSidebarControl(preferOpen) {
		const sidebar = qs('#sidebar');
		const expanded = Boolean(sidebar && isSidebarExpanded(sidebar));
		if (preferOpen && expanded) return true;
		if (!preferOpen && !expanded) return true;

		// Prefer a visible, labeled toggle inside the sidebar itself.
		if (sidebar) {
			const toggle = findSidebarToggleIn(sidebar);
			if (toggle && isVisible(toggle)) {
				toggle.click();
				return true;
			}
		}

		// Mobile navbar button (may be visually clipped but still in DOM).
		const mobileBtn = findMobileNavbarSidebarButton();
		if (mobileBtn) {
			const style = window.getComputedStyle(mobileBtn);
			if (style.display !== 'none') {
				mobileBtn.click();
				return true;
			}
		}

		// Reliable fallback used by Open WebUI itself.
		toggleSidebarViaShortcut();
		return true;
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
			}, 160);
		}
	}

	function openSidebar() {
		withToggleLock(() => {
			clickSidebarControl(true);
		});
	}

	function closeSidebar() {
		withToggleLock(() => {
			clickSidebarControl(false);
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

	function markInputHost() {
		const input = qs('#message-input-container');
		if (!input) return;
		const host = input.parentElement;
		if (!host) return;
		if (host.id === 'messages-container') return;
		host.classList.add('custom-ui-input-host');
	}

	function markModelStack() {
		const buttons = document.querySelectorAll(
			'#chat-container nav.sticky.top-0 button[id^="model-selector-"]'
		);
		if (!buttons.length) return;

		// Common ancestor that directly contains one child per model row.
		let ancestor = buttons[0].parentElement;
		while (ancestor && ancestor !== document.body) {
			let containsAll = true;
			for (const button of buttons) {
				if (!ancestor.contains(button)) {
					containsAll = false;
					break;
				}
			}
			if (!containsAll) break;

			const directKids = Array.from(ancestor.children).filter((child) =>
				Boolean(child.querySelector?.('button[id^="model-selector-"]'))
			);
			if (directKids.length >= buttons.length) {
				ancestor.classList.add('custom-ui-model-stack');
				return;
			}
			ancestor = ancestor.parentElement;
		}
	}

	function ensureSidebarButton() {
		let btn = qs('#custom-ui-sidebar-btn');
		if (btn) {
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

		let lastActivateAt = 0;
		const activate = (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === 'function') {
				event.stopImmediatePropagation();
			}

			const now = Date.now();
			if (now - lastActivateAt < 450) return;
			lastActivateAt = now;

			closeTopbar();
			closeInput();
			openSidebar();
		};

		btn.addEventListener('pointerup', activate, true);
		btn.addEventListener('click', activate, true);

		return btn;
	}

	function removeLegacyHitLayers() {
		qs('#custom-ui-topbar-hit')?.remove();
		qs('#custom-ui-input-hit')?.remove();
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

	function isTopbarOpen() {
		return document.documentElement.classList.contains('custom-ui-topbar-open');
	}

	function setupTopbarRegion() {
		const nav = qs('#chat-container nav.sticky.top-0');
		if (!nav || nav.dataset.customRegionBound === '1') return;
		nav.dataset.customRegionBound = '1';

		const interceptCollapsedModelClick = (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (isTopbarOpen()) return;
			if (!document.documentElement.classList.contains('custom-ui-has-messages')) return;

			const modelBtn = target.closest('button[id^="model-selector-"]');
			const inModelArea = target.closest('.flex-1.overflow-hidden, .custom-ui-model-stack');
			if (!modelBtn && !inModelArea) return;

			// Collapsed: do NOT open the full model catalog dropdown.
			// Expand the in-use model list instead.
			event.preventDefault();
			event.stopPropagation();
			if (typeof event.stopImmediatePropagation === 'function') {
				event.stopImmediatePropagation();
			}

			closeSidebar();
			closeInput();
			openTopbar();
		};

		nav.addEventListener('pointerdown', interceptCollapsedModelClick, true);
		nav.addEventListener('click', interceptCollapsedModelClick, true);

		nav.addEventListener(
			'pointerdown',
			(event) => {
				const target = event.target;
				if (!(target instanceof Element)) return;
				if (target.closest('#custom-ui-sidebar-btn')) return;

				const btn = target.closest('button');
				const label = btn?.getAttribute('aria-label') || '';
				if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) return;

				const mobileToggle = findMobileNavbarSidebarButton();
				if (mobileToggle && (btn === mobileToggle || mobileToggle.contains(target))) return;

				if (!target.closest('.flex-1.overflow-hidden, .custom-ui-model-stack')) return;

				closeSidebar();
				closeInput();
				openTopbar();
			},
			true
		);
	}

	function setupInputRegion() {
		const input = qs('#message-input-container');
		if (!input) return;
		markInputHost();
		if (input.dataset.customRegionBound === '1') return;
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
		if (target.closest('#custom-ui-sidebar-btn')) return;

		const inSidebar = Boolean(target.closest('#sidebar'));
		const inTopbar = Boolean(target.closest('#chat-container nav.sticky.top-0'));
		const inInput =
			Boolean(target.closest('#message-input-container')) ||
			Boolean(target.closest('.custom-ui-input-host')) ||
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

		markInputHost();
		markModelStack();
		syncSidebarOpenClass();
	}

	function bootstrap() {
		if (bootstrapped) return;
		bootstrapped = true;

		window.setTimeout(() => {
			// Close via UI path only — avoid fighting the Svelte store with localStorage writes.
			closeSidebar();
			closeTopbar();
			closeInput();
			ensureSidebarButton();
			removeLegacyHitLayers();
			markInputHost();
			markModelStack();
			syncSidebarOpenClass();
		}, 250);
	}

	function refreshChrome() {
		ensureSidebarButton();
		removeLegacyHitLayers();
		setupSidebarRegion();
		setupTopbarRegion();
		setupInputRegion();
		updatePageState();
	}

	function init() {
		ensureSidebarButton();
		removeLegacyHitLayers();
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
		clearTimeout(observerTimer);
		observerTimer = window.setTimeout(refreshChrome, OBSERVER_DEBOUNCE_MS);
	});

	observer.observe(document.body, { childList: true, subtree: true });
})();
