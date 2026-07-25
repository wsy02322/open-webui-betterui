(function () {
	'use strict';

	const MOBILE_BREAKPOINT = 768;
	const SIDEBAR_LEAVE_DELAY_MS = 300;

	let sidebarLeaveTimer = null;
	let sidebarHoverBound = false;

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

	function setupSidebarHover() {
		const sidebar = document.getElementById('sidebar');
		if (!sidebar || sidebarHoverBound) return;

		sidebarHoverBound = true;

		sidebar.addEventListener('mouseenter', () => {
			clearTimeout(sidebarLeaveTimer);

			if (!isDesktop() || isSidebarExpanded(sidebar)) return;

			const toggle = findSidebarToggleButton(sidebar);
			toggle?.click();
		});

		sidebar.addEventListener('mouseleave', () => {
			if (!isDesktop() || !isSidebarExpanded(sidebar)) return;

			clearTimeout(sidebarLeaveTimer);
			sidebarLeaveTimer = window.setTimeout(() => {
				const currentSidebar = document.getElementById('sidebar');
				if (!currentSidebar || !isSidebarExpanded(currentSidebar)) return;

				const toggle = findSidebarToggleButton(currentSidebar);
				toggle?.click();
			}, SIDEBAR_LEAVE_DELAY_MS);
		});
	}

	function init() {
		setupSidebarHover();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}

	// Re-bind after SPA navigations replace the sidebar node.
	const observer = new MutationObserver(() => {
		const sidebar = document.getElementById('sidebar');
		if (sidebar && !sidebarHoverBound) {
			sidebarHoverBound = false;
			setupSidebarHover();
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });
})();
