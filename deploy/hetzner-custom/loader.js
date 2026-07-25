(function () {
	'use strict';

	const MOBILE_BREAKPOINT = 768;
	const SIDEBAR_LEAVE_DELAY_MS = 300;

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
		return sidebar.getAttribute('data-state') === 'true';
	}

	function ensureSidebarTrigger() {
		if (document.getElementById('custom-ui-sidebar-trigger')) return;

		const trigger = document.createElement('div');
		trigger.id = 'custom-ui-sidebar-trigger';
		trigger.setAttribute('aria-hidden', 'true');
		document.body.appendChild(trigger);

		trigger.addEventListener('mouseenter', () => {
			if (!isDesktop()) return;
			const sidebar = document.getElementById('sidebar');
			if (!sidebar || isSidebarExpanded(sidebar)) return;
			findSidebarToggleButton(sidebar)?.click();
		});
	}

	function collapseSidebarIfNeeded() {
		if (!isDesktop()) return;
		const sidebar = document.getElementById('sidebar');
		if (!sidebar || !isSidebarExpanded(sidebar)) return;
		findSidebarToggleButton(sidebar)?.click();
	}

	function setupSidebarHover() {
		const sidebar = document.getElementById('sidebar');
		if (!sidebar || sidebar.dataset.customHoverBound === '1') return;

		sidebar.dataset.customHoverBound = '1';

		sidebar.addEventListener('mouseenter', () => {
			clearTimeout(sidebarLeaveTimer);
			if (!isDesktop() || isSidebarExpanded(sidebar)) return;
			findSidebarToggleButton(sidebar)?.click();
		});

		sidebar.addEventListener('mouseleave', () => {
			if (!isDesktop() || !isSidebarExpanded(sidebar)) return;
			clearTimeout(sidebarLeaveTimer);
			sidebarLeaveTimer = window.setTimeout(() => {
				collapseSidebarIfNeeded();
			}, SIDEBAR_LEAVE_DELAY_MS);
		});
	}

	function updatePageState() {
		document.documentElement.classList.add('custom-ui-active');

		const hasMessages = Boolean(
			document.querySelector('#messages-container .message-listitem, .message-listitem')
		);
		document.documentElement.classList.toggle('custom-ui-has-messages', hasMessages);
	}

	function bootstrapSidebarState() {
		try {
			localStorage.sidebar = 'false';
		} catch (error) {
			/* ignore */
		}

		window.setTimeout(() => {
			collapseSidebarIfNeeded();
		}, 300);
	}

	function init() {
		ensureSidebarTrigger();
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
		setupSidebarHover();
		updatePageState();
	});

	observer.observe(document.body, { childList: true, subtree: true });
	window.addEventListener('resize', updatePageState);
})();
