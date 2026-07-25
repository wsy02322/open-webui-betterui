(function () {
	'use strict';

	const MOBILE_BREAKPOINT = 768;
	const SIDEBAR_LEAVE_DELAY_MS = 350;

	let sidebarLeaveTimer = null;

	function isDesktop() {
		return window.innerWidth >= MOBILE_BREAKPOINT;
	}

	function findSidebarToggleButton(sidebar) {
		const buttons = sidebar.querySelectorAll('button[aria-label]');
		for (const button of buttons) {
			const label = button.getAttribute('aria-label') || '';
			if (/sidebar|侧栏|侧边栏|边栏/i.test(label)) {
				return button;
			}
		}
		return sidebar.querySelector('button');
	}

	function isSidebarExpanded(sidebar) {
		return sidebar?.getAttribute('data-state') === 'true';
	}

	function syncSidebarOpenClass() {
		const sidebar = document.getElementById('sidebar');
		const open = isSidebarExpanded(sidebar);
		document.documentElement.classList.toggle('custom-ui-sidebar-open', open);

		const btn = document.getElementById('custom-ui-sidebar-btn');
		if (btn) {
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			btn.style.display = open ? 'none' : 'inline-flex';
		}
	}

	function toggleSidebar() {
		const sidebar = document.getElementById('sidebar');
		if (!sidebar) return;
		findSidebarToggleButton(sidebar)?.click();
		window.setTimeout(syncSidebarOpenClass, 50);
	}

	function ensureSidebarButton() {
		let btn = document.getElementById('custom-ui-sidebar-btn');
		if (btn) return btn;

		btn = document.createElement('button');
		btn.id = 'custom-ui-sidebar-btn';
		btn.type = 'button';
		btn.title = 'Open sidebar';
		btn.setAttribute('aria-label', 'Open sidebar');
		btn.setAttribute('aria-expanded', 'false');

		const img = document.createElement('img');
		img.src = '/static/favicon.png';
		img.alt = '';
		img.draggable = false;
		btn.appendChild(img);

		btn.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			toggleSidebar();
		});

		document.body.appendChild(btn);
		return btn;
	}

	function collapseSidebarIfNeeded() {
		const sidebar = document.getElementById('sidebar');
		if (!sidebar || !isSidebarExpanded(sidebar)) {
			syncSidebarOpenClass();
			return;
		}
		findSidebarToggleButton(sidebar)?.click();
		window.setTimeout(syncSidebarOpenClass, 50);
	}

	function setupSidebarHover() {
		const sidebar = document.getElementById('sidebar');
		if (!sidebar || sidebar.dataset.customHoverBound === '1') return;

		sidebar.dataset.customHoverBound = '1';

		sidebar.addEventListener('mouseleave', () => {
			if (!isDesktop() || !isSidebarExpanded(sidebar)) return;
			clearTimeout(sidebarLeaveTimer);
			sidebarLeaveTimer = window.setTimeout(() => {
				collapseSidebarIfNeeded();
			}, SIDEBAR_LEAVE_DELAY_MS);
		});

		sidebar.addEventListener('mouseenter', () => {
			clearTimeout(sidebarLeaveTimer);
		});
	}

	function updatePageState() {
		document.documentElement.classList.add('custom-ui-active');

		const hasMessages = Boolean(
			document.querySelector('#messages-container .message-listitem, .message-listitem')
		);
		document.documentElement.classList.toggle('custom-ui-has-messages', hasMessages);
		syncSidebarOpenClass();
	}

	function bootstrapSidebarState() {
		try {
			localStorage.sidebar = 'false';
		} catch (error) {
			/* ignore */
		}

		window.setTimeout(() => {
			collapseSidebarIfNeeded();
			ensureSidebarButton();
			syncSidebarOpenClass();
		}, 250);
	}

	function init() {
		ensureSidebarButton();
		setupSidebarHover();
		updatePageState();
		bootstrapSidebarState();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}

	const observer = new MutationObserver(() => {
		ensureSidebarButton();
		setupSidebarHover();
		updatePageState();
	});

	observer.observe(document.body, { childList: true, subtree: true });
	window.addEventListener('resize', updatePageState);
})();
